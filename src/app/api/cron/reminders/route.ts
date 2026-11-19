// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { hasEarlierDeadline, reminderCancelNotice, selfCancelDeadline } from "@/lib/cancel-deadline"
import { NextResponse } from "next/server"
import { pickShiftInfo, withDayContact, withSectorLeaders } from "@/lib/shift-info"
import { parseNotificationSettings, reminderEnabled } from "@/lib/notification-settings"
import { recordJobRun } from "@/lib/job-runs"
import { env } from "@/lib/env"
import { isCronAuthorized } from "@/lib/cron-auth"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { promoteNextInWaitlist, reconcileWaitlists } from "@/lib/waitlist"
import { expireSignupConfirmations } from "@/lib/signup-confirmation-server"
import { sendPushToVolunteer } from "@/lib/push"
import { reportError } from "@/lib/report-error"
import { deliverOutbox, outboxHealth } from "@/lib/notifications/outbox"
import * as Sentry from "@sentry/nextjs"
import { registrationToken } from "@/lib/token-vault"
import { readLegacyReminderRecipient, type LegacyReminderDb } from "@/lib/org-link-email"
import { orgTimeZone } from "@/lib/time-zone"
import { reminderCandidateDates, remindersDue, type GroupableRegistration } from "@/lib/reminder-groups"
import { REMINDER_WINDOW_HOURS } from "@/lib/automatic-reminders"
import { sendMilestoneOwnerReminders } from "@/lib/milestone-reminders"
import { expireSwapRequests } from "@/lib/shift-swap-server"
import { queueCustomRuleReminders } from "@/lib/reminder-rules-server"
import { claimReminderGroup, releaseReminderGroup } from "@/lib/reminder-claims"

export const dynamic = "force-dynamic"

// Auth: any caller must present `Authorization: Bearer <CRON_SECRET>`.
// In dev, if CRON_SECRET is unset we allow localhost requests so a manual
// `curl http://localhost:3000/api/cron/reminders` works for testing.
function isAuthorized(req: Request): boolean {
  return isCronAuthorized(req, env.CRON_SECRET)
}

type Window = { kind: "reminder_j2" | "reminder_j1" | "reminder_dd"; field: "reminderJ2Sent" | "reminderJ1Sent" | "reminderDdSent"; minHours: number; maxHours: number }

// The hours are shared with the reminders box of the admin event page (#705).
const WINDOWS: Window[] = [
  { kind: "reminder_j2", field: "reminderJ2Sent", ...REMINDER_WINDOW_HOURS.j2 },
  { kind: "reminder_j1", field: "reminderJ1Sent", ...REMINDER_WINDOW_HOURS.j1 },
  { kind: "reminder_dd", field: "reminderDdSent", ...REMINDER_WINDOW_HOURS.dd },
]

export async function GET(req: Request) {
  return run(req)
}

export async function POST(req: Request) {
  return run(req)
}

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await recordJobRun("reminders", async () => {

  const now = new Date()
  const totals: Record<string, { eligible: number; groups: number; sent: number; failed: number }> = {}

  // Events with their own reminder rules (#1139) never enter the legacy windows below: their
  // unique occurrence is claimed and queued here, then delivered by the outbox at the end of the
  // run like every other queued email. No rule row means the legacy path, unchanged.
  const custom = await queueCustomRuleReminders(now).catch((e) => {
    reportError("reminders.custom")(e)
    return null
  })

  for (const win of WINDOWS) {
    const lower = new Date(now.getTime() + win.minHours * 3600 * 1000)
    const upper = new Date(now.getTime() + win.maxHours * 3600 * 1000)

    // Pull the active registrations of the days around the window that have not received this
    // reminder yet. The window is
    // computed on the candidate set in JS (cheap with index + status filter), per *group*
    // (#672): several shifts of the same volunteer, event and local day are sent as one email,
    // triggered once the earliest of them enters the window — see groupRemindersByDay.
    const candidates = await prisma.registration.findMany({
      where: {
        status: "active",
        [win.field]: null,
        // An event whose rules are all archived is back in default mode: an archived row is
        // history, not a custom delay, so the legacy windows apply again.
        event: { remindersEnabled: true, publicStatus: "published", reminderRules: { none: { archivedAt: null } } },
        // Only the days around this window: never the whole history of registrations that did
        // not get this reminder (src/lib/reminder-groups.ts, reminderCandidateDates).
        shift: { status: { not: "cancelled" }, date: reminderCandidateDates(lower, upper) },
      },
      include: {
        volunteer: true,
        shift: true,
        event: { include: { organization: { select: { name: true, slug: true, timeZone: true, notificationSettings: true } }, sectorLeaders: { select: { roleName: true, name: true } } } },
      },
    })

    // The organization may have switched this reminder off (#381), per registration's own event.
    const eligible = candidates.filter((r) =>
      reminderEnabled(parseNotificationSettings(r.event.organization.notificationSettings), win.kind),
    )

    const triggered = remindersDue(eligible as (typeof eligible[number] & GroupableRegistration)[], (r) => orgTimeZone(r.event.organization), lower, upper)

    let eligibleShifts = 0
    let sent = 0
    let failed = 0
    for (const group of triggered) {
      eligibleShifts += group.registrations.length
      const [first] = group.registrations
      const shifts = group.registrations.map((r) => ({
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
        // The event's day-of contact (#560) when the shift has none, and the role's sector leaders
        // by name: reminders go to confirmed volunteers only.
        ...withSectorLeaders(withDayContact(pickShiftInfo(r.shift, r.event), r.event), r.shift.roleName, r.event.sectorLeaders),
      }))
      // Claimed before the send: two calls running together never both write to the volunteer.
      // A group another call holds is neither sent nor failed here (src/lib/reminder-claims.ts).
      const ids = group.registrations.map((r) => r.id)
      if (!(await claimReminderGroup(ids, win.field, now))) continue
      // Anything that throws from here, building the email or sending it, gives the group back.
      const result = await (async () => {
        // The reminder's main button is the organisation-wide link (#1429, lot B). The rows were
        // selected with the address read then; the token and the current address are read in one
        // transaction, so a token issued now never reaches the old inbox of an address that changed
        // since. A member without an address has no email to send and no link is issued for them.
        const recipient = first.volunteer.email?.trim()
          ? await readLegacyReminderRecipient(prisma as unknown as LegacyReminderDb, {
              volunteerId: first.volunteerId,
              organizationId: first.event.organizationId,
              selectedEmail: first.volunteer.email,
              organizationName: first.event.organization.name,
              now,
            })
          : null
        // The address changed after selection: nothing is sent to the old one. The group is given
        // back below, so a later run writes to the current address.
        if (!recipient) return null
        return sendNotification({
          kind: win.kind,
          recipient: { email: recipient.email, name: first.volunteer.firstName },
          volunteerId: first.volunteerId,
          organizationId: first.event.organizationId,
          data: {
            volunteerName: first.volunteer.firstName,
            eventTitle: first.event.title,
            eventId: first.eventId,
            organizationName: first.event.organization.name,
            orgSlug: first.event.organization.slug,
            shifts,
            // Any registration's token of this volunteer+event opens the same personal page,
            // listing every one of their shifts for the event (src/app/api/public/registrations).
            editToken: registrationToken.reveal(first),
            ...(recipient.orgToken ? { orgToken: recipient.orgToken } : {}),
            hoursUntil: Math.max(0, Math.round((group.earliestStart.getTime() - now.getTime()) / (3600 * 1000))),
            // The event's earlier self-cancellation deadline (#946), for the group's first shift.
            cancelNotice: reminderCancelNotice(first.shift, first.event, orgTimeZone(first.event.organization), now),
            cancelClosed: hasEarlierDeadline(first.event) && now >= selfCancelDeadline(first.shift, first.event, orgTimeZone(first.event.organization)),
          },
        })
      })().catch(async (e) => {
        await releaseReminderGroup(ids, win.field)
        throw e
      })
      if (result === null) {
        // An address that changed after selection: the claim goes back for the next run.
        await releaseReminderGroup(ids, win.field)
        continue
      }
      if (result.ok) {
        // Every shift of the group stays marked: a later run never re-sends any of them (#672).
        const hoursLabel =
          win.kind === "reminder_j2" ? "dans 2 jours" :
          win.kind === "reminder_j1" ? "demain" : "aujourd'hui"
        const body = group.registrations.length === 1
          ? `Rappel : votre créneau "${first.shift.label}" commence ${hoursLabel}.`
          : `Rappel : vos ${group.registrations.length} créneaux commencent ${hoursLabel}.`
        sendPushToVolunteer(first.volunteerId, {
          title: first.event.title,
          body,
          url: `/my/${registrationToken.reveal(first)}`,
          tag: `reminder-group-${first.volunteerId}-${first.eventId}-${group.localDay}-${win.kind}`,
        }).catch(reportError("push.reminder"))
        sent++
      } else {
        // The whole group is given back, so it is retried together next time (#672).
        await releaseReminderGroup(ids, win.field)
        failed++
      }
    }

    totals[win.kind] = { eligible: eligibleShifts, groups: triggered.length, sent, failed }
  }

  // Expire offered waitlist spots and promote next in line
  const expiredOffers = await prisma.registration.findMany({
    where: {
      status: "offered",
      waitingExpiresAt: { lt: now },
    },
    select: { id: true, shiftId: true },
  })

  for (const reg of expiredOffers) {
    // Conditional (#264): the volunteer may have confirmed between the read above and now.
    const { count } = await prisma.registration.updateMany({
      where: { id: reg.id, status: "offered", waitingExpiresAt: { lt: now } },
      data: { status: "cancelled" },
    })
    if (count === 0) continue
    await promoteNextInWaitlist(reg.shiftId).catch(reportError("waitlist.promote"))
  }

  // Provisional places of public sign-ups whose email confirmation deadline passed (#1253):
  // freed like a withdrawal, then offered to the waitlist of each shift.
  const expiredConfirmations = await expireSignupConfirmations(now).catch((e) => {
    reportError("signup_confirmation.expire")(e)
    return null
  })
  for (const shiftId of expiredConfirmations?.shifts ?? []) {
    await promoteNextInWaitlist(shiftId).catch(reportError("waitlist.promote"))
  }

  // Catch up on promotions that failed after a cancellation: a free spot with people waiting.
  const waitlist = await reconcileWaitlists(now).catch((e) => {
    reportError("waitlist.reconcile")(e)
    return null
  })

  // Shift swap requests past their deadline (#1174): ended as expired, the people told.
  const expiredSwaps = await expireSwapRequests(now).catch((e) => {
    reportError("swaps.expire")(e)
    return null
  })

  // Milestone owners whose due day approaches (#985): queued here, delivered just below.
  const milestoneOwners = await sendMilestoneOwnerReminders(now).catch((e) => {
    reportError("milestones.owner_reminders")(e)
    return null
  })

  // Retry notifications whose immediate delivery failed (outbox, #293).
  const outbox = await deliverOutbox().catch((e) => {
    reportError("outbox.cron_deliver")(e)
    return null
  })
  // Queue health (#316): alert when delivery is stuck. A row that gave up was already reported
  // when it failed; alerting on it here too would repeat every hour for a day.
  const outboxStatus = await outboxHealth(now).catch((e) => {
    reportError("outbox.health")(e)
    return null
  })
  if (outboxStatus?.stuck) {
    Sentry.captureMessage("Notification outbox unhealthy", { level: "warning", extra: { ...outboxStatus } })
  }

  return {
    runAt: now.toISOString(),
    totals,
    custom,
    expiredOffers: expiredOffers.length,
    expiredConfirmations,
    waitlist,
    expiredSwaps,
    milestoneOwners,
    outbox,
    outboxStatus,
  }
  })
  return NextResponse.json(summary)
}
