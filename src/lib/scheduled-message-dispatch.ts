// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { getOrgClient } from "./prisma-org"
import { enqueueBatch } from "./notifications/outbox"
import { buildTargetedMessage } from "./targeted-message-build"
import { audienceSchema, messagePushPayload } from "./targeted-message"
import { renderVariables, templateProblems } from "./message-template"
import { formatScheduledFor, SCHEDULE_STALE_CLAIM_MS, skipReason } from "./scheduled-message"
import { logEvent, SYSTEM_ACTOR } from "./event-log"
import { orgTimeZone } from "./time-zone"
import { pushDeviceCount, sendTargetedPush } from "./push"
import { reportError } from "./report-error"

export type DispatchResult = { sent: number; skipped: number; failed: number }

export type DispatchOptions = {
  limit?: number
  /**
   * Runs a message's push delivery. By default it is awaited in place; the outbox cron hands it to
   * `after()` so push services never delay the email delivery that follows (#1041). The outcomes
   * are recorded on the history row either way.
   */
  deferPush?: (job: () => Promise<unknown>) => void
}

/**
 * Sends the scheduled messages that became due (#1019), from the outbox cron (every 5 minutes).
 *
 * Each row is claimed first with a conditional update ("scheduled" → "sending"), so two runs never
 * take the same one; a run that crashed leaves it "sending", picked up again after
 * SCHEDULE_STALE_CLAIM_MS. Then, in one transaction that re-checks the claim, the history row
 * (TargetedMessage) is created, the emails queued with a dedupe key per scheduled message and
 * person, and the row marked "sent": it goes once, or not at all and is retried. The emails
 * themselves leave with the outbox delivery that runs right after, with its own retries.
 *
 * The recipients are computed now, from the event's current registrations: the organiser was told
 * so when scheduling. An archived event, a removed or cancelled shift, unknown template variables
 * or nobody left in the audience mark it "skipped" with the reason, logged; a cancelled row is
 * never picked.
 */
export async function dispatchScheduledMessages(now: Date = new Date(), opts: DispatchOptions = {}): Promise<DispatchResult> {
  const due = await prisma.scheduledMessage.findMany({
    where: {
      OR: [
        { status: "scheduled", scheduledFor: { lte: now } },
        { status: "sending", claimedAt: { lt: new Date(now.getTime() - SCHEDULE_STALE_CLAIM_MS) } },
      ],
    },
    orderBy: { scheduledFor: "asc" },
    take: opts.limit ?? 50,
    select: { id: true, status: true, claimedAt: true },
  })

  const result: DispatchResult = { sent: 0, skipped: 0, failed: 0 }
  for (const row of due) {
    const { count } = await prisma.scheduledMessage.updateMany({
      where: { id: row.id, status: row.status, claimedAt: row.claimedAt },
      data: { status: "sending", claimedAt: now },
    })
    if (count === 0) continue // cancelled or claimed by another run meanwhile
    try {
      const outcome = await dispatchOne(row.id, now, opts.deferPush)
      result[outcome]++
    } catch (e) {
      // Back to "scheduled": tried again at the next run. Nothing was queued (the transaction
      // rolled back), so nothing can go twice.
      reportError("scheduled_message.dispatch")(e)
      await prisma.scheduledMessage.updateMany({ where: { id: row.id, status: "sending", claimedAt: now }, data: { status: "scheduled", claimedAt: null } })
      result.failed++
    }
  }
  return result
}

async function dispatchOne(id: string, now: Date, deferPush?: DispatchOptions["deferPush"]): Promise<"sent" | "skipped"> {
  const sm = await prisma.scheduledMessage.findUniqueOrThrow({
    where: { id },
    include: { event: { select: { id: true, title: true, slug: true, organizationId: true, publicStatus: true, organization: { select: { name: true, slug: true, timeZone: true } } } } },
  })
  const { event } = sm
  const timeZone = orgTimeZone(event.organization)
  const when = `${formatScheduledFor(sm.scheduledFor, timeZone, now)} (${timeZone})`

  const skip = async (reason: string) => {
    const { count } = await prisma.scheduledMessage.updateMany({ where: { id, status: "sending", claimedAt: now }, data: { status: "skipped", skipReason: reason, claimedAt: null } })
    if (count === 1) {
      await logEvent({
        eventId: event.id, actor: SYSTEM_ACTOR, action: "message.schedule_skipped", entityType: "Event", entityId: event.id,
        changes: { subject: { from: null, to: sm.subject }, scheduledFor: { from: null, to: when }, reason: { from: null, to: reason } },
      })
    }
    return "skipped" as const
  }

  const parsedAudience = audienceSchema.safeParse(sm.audience)
  if (!parsedAudience.success) return skip("destinataires illisibles")
  const audience = parsedAudience.data
  if (event.publicStatus === "archived") return skip(skipReason({ eventStatus: event.publicStatus, audience, shiftAvailable: true, recipients: 1 })!)

  const db = getOrgClient(sm.organizationId)
  const shiftAvailable = audience.kind !== "shift" ||
    !!(await db.shift.findFirst({ where: { id: audience.shiftId, eventId: event.id, status: { not: "cancelled" } }, select: { id: true } }))
  const problems = templateProblems(`${sm.subject}\n${sm.message}`, audience.kind)
  if (problems.length > 0) return skip(`variables du texte refusées (${problems.join(" ")})`)

  const build = await buildTargetedMessage(db, event, audience, sm.subject, sm.message)
  const reason = skipReason({ eventStatus: event.publicStatus, audience, shiftAvailable, recipients: build.recipients.length, sectorGone: build.sectorGone })
  if (reason) return skip(reason)

  const pushDevices = sm.push ? await pushDeviceCount(build.recipients.map((r) => r.volunteerId)) : 0
  const historyId = await prisma.$transaction(async (tx) => {
    // The claim is still ours: a stale pickup by another run (after a very slow one) finds it
    // "sent" or reclaimed and rolls back here, before anything is queued.
    const { count } = await tx.scheduledMessage.updateMany({ where: { id, status: "sending", claimedAt: now }, data: { status: "sent", claimedAt: null } })
    if (count !== 1) throw new Error(`Scheduled message ${id} lost its claim`)
    const history = await tx.targetedMessage.create({
      data: {
        organizationId: sm.organizationId,
        eventId: event.id,
        authorId: sm.authorId,
        authorName: sm.authorName,
        subject: sm.subject,
        message: sm.message,
        audienceLabel: build.label,
        recipientCount: build.recipients.length,
        pushRequested: sm.push,
        pushDevices,
      },
      select: { id: true },
    })
    // Its « envoi groupé » (#1101), credited to whoever scheduled it.
    await enqueueBatch(
      build.recipients.map((r) => build.payloadFor(r, `message:scheduled:${sm.id}:${r.volunteerId}`)),
      tx,
      { organizationId: sm.organizationId, targetedMessageId: history.id, batch: { kind: "scheduled_message", eventId: event.id, actorId: sm.authorId } },
    )
    await tx.scheduledMessage.update({ where: { id }, data: { targetedMessageId: history.id } })
    return history.id
  })

  // The push only complements the email (#468), as for an immediate send.
  if (sm.push && pushDevices > 0) {
    const targets = build.recipients.map((r) => ({
      volunteerId: r.volunteerId,
      ...messagePushPayload(renderVariables(sm.subject, build.vars(r)), renderVariables(sm.message, build.vars(r))),
      url: r.editToken ? `/my/${r.editToken}` : r.signupUrl ? (() => { const u = new URL(r.signupUrl!); return u.pathname + u.search })() : `/${event.slug}`,
    }))
    const job = () => sendTargetedPush(historyId, targets, { ...messagePushPayload(sm.subject, sm.message), tag: `message-${historyId}` }).catch(reportError("push.scheduled_message"))
    if (deferPush) deferPush(job)
    else await job()
  }

  await logEvent({
    eventId: event.id,
    actor: SYSTEM_ACTOR,
    action: "message.sent",
    entityType: "Event",
    entityId: event.id,
    changes: {
      audience: { from: null, to: build.label },
      recipients: { from: null, to: build.recipients.length },
      subject: { from: null, to: sm.subject },
      scheduledFor: { from: null, to: when },
    },
  })
  return "sent"
}
