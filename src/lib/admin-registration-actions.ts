import type { OrgScopedPrisma } from "./prisma-org"
import { logEvent, type LogActor } from "./event-log"
import { sendNotification } from "./notifications"
import { promoteNextInWaitlist } from "./waitlist"
import { tagVolunteerAsResponsable } from "./sector-leaders"
import { reportError } from "./report-error"
import { generateToken } from "./utils"

/**
 * Admin actions on registrations, shared by the single-row routes and the bulk route (#292), so
 * "retirer", "rendre responsable" and "renvoyer le lien" behave the same whether one row or
 * fifty are selected. Every function takes the org-scoped `db` (#268): ownership is enforced
 * by the client, callers only decide *which* rows.
 */

type CancelTarget = { id: string; eventId: string; shiftId: string; status: string }

/**
 * Cancels the given registrations. Conditional on each still being live, so a row cancelled
 * meanwhile (or selected twice) isn't cancelled, logged and promoted from twice. Then, per
 * shift: reopen it if it was "full", and offer the freed spots to the waitlist one after the
 * other (promoteNextInWaitlist is capacity-aware and locks the shift, so sequential calls give
 * one offer per freed spot).
 */
export async function cancelRegistrations(db: OrgScopedPrisma, actor: LogActor, targets: CancelTarget[]): Promise<string[]> {
  const cancelled: { reg: CancelTarget; logId: string | null }[] = []
  for (const reg of targets) {
    const { count } = await db.registration.updateMany({
      where: { id: reg.id, status: { not: "cancelled" } },
      data: { status: "cancelled" },
    })
    if (count === 0) continue
    const logId = await logEvent({
      eventId: reg.eventId,
      actor,
      action: "registration.cancelled",
      entityType: "Registration",
      entityId: reg.id,
      // shiftId unchanged: recorded so the narrative can still name the shift — see
      // describeChanges's shiftId filter in event-log-narrative.ts.
      changes: { status: { from: reg.status, to: "cancelled" }, shiftId: { from: reg.shiftId, to: reg.shiftId } },
    })
    cancelled.push({ reg, logId })
  }

  const byShift = new Map<string, (string | null)[]>()
  for (const { reg, logId } of cancelled) byShift.set(reg.shiftId, [...(byShift.get(reg.shiftId) ?? []), logId])

  for (const [shiftId, logIds] of byShift) {
    const shift = await db.shift.findFirst({ where: { id: shiftId }, select: { capacity: true, status: true } })
    if (shift?.status === "full") {
      const active = await db.registration.count({ where: { shiftId, status: "active" } })
      if (active < shift.capacity) await db.shift.updateMany({ where: { id: shiftId }, data: { status: "open" } })
    }
    for (const logId of logIds) {
      await promoteNextInWaitlist(shiftId, logId ?? undefined).catch(reportError("waitlist.promote"))
    }
  }

  return cancelled.map((c) => c.reg.id)
}

export type LeaderInput = { roleName: string; name: string; email: string }

/**
 * Makes someone sector leader of a role on an event (#186): creates the SectorLeader, logs it,
 * tags the member "Responsable", emails them their link. `exists` when they already lead it.
 */
export async function addSectorLeader(
  db: OrgScopedPrisma,
  ctx: { organizationId: string; actor: LogActor; event: { id: string; title: string; organization: { slug: string } } },
  input: LeaderInput,
) {
  const existing = await db.sectorLeader.findFirst({ where: { eventId: ctx.event.id, roleName: input.roleName, email: input.email } })
  if (existing) return { status: "exists" as const, leader: existing }

  const leader = await db.sectorLeader.create({
    data: { eventId: ctx.event.id, roleName: input.roleName, name: input.name, email: input.email, token: generateToken() },
  })

  await logEvent({
    eventId: ctx.event.id,
    actor: ctx.actor,
    action: "sectorleader.added",
    entityType: "SectorLeader",
    entityId: leader.id,
    changes: { roleName: { from: null, to: leader.roleName } },
  })

  await tagVolunteerAsResponsable(ctx.organizationId, leader.email).catch(reportError("sector_leader.tag_member"))

  await sendNotification({
    kind: "sector_leader_invite",
    recipient: { email: leader.email, name: leader.name },
    data: {
      leaderName: leader.name,
      roleName: leader.roleName,
      eventTitle: ctx.event.title,
      orgSlug: ctx.event.organization.slug,
      token: leader.token,
    },
  }).catch(reportError("notification.sector_leader_invite"))

  return { status: "created" as const, leader }
}

type ResendTarget = {
  editToken: string
  volunteer: { id: string; firstName: string; lastName: string; email: string | null }
  event: { title: string; organization: { slug: string } }
}

/**
 * Emails a volunteer their personal management link (/my/<token>). Any of their active
 * registrations for the event opens the full list, so one email per volunteer is enough even
 * when several of their rows are selected.
 */
export async function resendManagementLinks(targets: ResendTarget[]): Promise<{ sent: number; failed: number; skipped: number }> {
  const onePerVolunteer = new Map<string, ResendTarget>()
  let skipped = 0
  for (const t of targets) {
    if (!t.volunteer.email) { skipped++; continue }
    if (!onePerVolunteer.has(t.volunteer.id)) onePerVolunteer.set(t.volunteer.id, t)
  }
  let sent = 0
  let failed = 0
  for (const t of onePerVolunteer.values()) {
    const name = `${t.volunteer.firstName} ${t.volunteer.lastName}`
    const result = await sendNotification({
      kind: "registration_link_resend",
      recipient: { email: t.volunteer.email, name },
      data: { volunteerName: name, eventTitle: t.event.title, orgSlug: t.event.organization.slug, editToken: t.editToken },
    }).catch((e) => {
      reportError("notification.registration_link_resend")(e)
      return { ok: false }
    })
    if (result.ok) sent++; else failed++
  }
  return { sent, failed, skipped }
}
