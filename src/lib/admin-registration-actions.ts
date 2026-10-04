// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { logEvent, type LogActor } from "./event-log"
import { sendNotification } from "./notifications"
import { promoteNextInWaitlist } from "./waitlist"
import { tagVolunteerAsResponsable } from "./sector-leaders"
import { reportError } from "./report-error"
import { generateToken } from "./utils"
import { linkToken } from "./token-vault"
import { deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"

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

export type PresenceTarget = { id: string; eventId: string; shiftId: string; status: string }

/**
 * Lightweight check-in (#399): marks the given registrations present (or undoes it). Only
 * confirmed registrations, and only rows whose mark actually changes, so a row selected twice
 * or already marked isn't logged twice. Returns the ids changed.
 */
export async function setPresence(db: OrgScopedPrisma, actor: LogActor, targets: PresenceTarget[], present: boolean, now: Date = new Date()): Promise<string[]> {
  const changed: string[] = []
  for (const reg of targets) {
    if (reg.status !== "active") continue
    const { count } = await db.registration.updateMany({
      where: { id: reg.id, status: "active", checkedInAt: present ? null : { not: null } },
      data: { checkedInAt: present ? now : null },
    })
    if (count === 0) continue
    changed.push(reg.id)
    await logEvent({
      eventId: reg.eventId,
      actor,
      action: present ? "registration.checked_in" : "registration.check_in_undone",
      entityType: "Registration",
      entityId: reg.id,
      changes: { checkedInAt: { from: present ? null : "set", to: present ? now.toISOString() : null }, shiftId: { from: reg.shiftId, to: reg.shiftId } },
    })
  }
  return changed
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

  // Clear token only in memory (the invite email needs it); the DB keeps hash + encrypted copy.
  const token = generateToken()
  // The leader and their invite email commit together (#352).
  const { leader, outboxIds } = await db.$transaction(async (tx) => {
    const leader = await tx.sectorLeader.create({
      data: { eventId: ctx.event.id, roleName: input.roleName, name: input.name, email: input.email, ...linkToken.data(token) },
    })
    const outboxIds = await enqueueNotifications([{
      kind: "sector_leader_invite",
      organizationId: ctx.organizationId,
      dedupeKey: `sector_leader_invite:${leader.id}`,
      recipient: { email: leader.email, name: leader.name },
      data: {
        leaderName: leader.name,
        roleName: leader.roleName,
        eventTitle: ctx.event.title,
        orgSlug: ctx.event.organization.slug,
        token,
      },
    }], tx)
    return { leader, outboxIds }
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

  deliverAfterResponse(outboxIds)

  return { status: "created" as const, leader }
}

type ResendTarget = {
  editToken: string
  volunteer: { id: string; firstName: string; lastName: string; email: string | null }
  event: { title: string; organization: { slug: string } }
  organizationId?: string
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
      volunteerId: t.volunteer.id,
      organizationId: t.organizationId,
      data: { volunteerName: name, eventTitle: t.event.title, orgSlug: t.event.organization.slug, editToken: t.editToken },
    }).catch((e) => {
      reportError("notification.registration_link_resend")(e)
      return { ok: false }
    })
    if (result.ok) sent++; else failed++
  }
  return { sent, failed, skipped }
}
