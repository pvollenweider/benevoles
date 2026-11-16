// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import type { NotificationPayload } from "./notifications/types"
import { fmtRange } from "./gantt-utils"
import { audienceLabel, countDeclinedExcluded, selectInvitedWithoutShift, selectRecipients, type Audience } from "./targeted-message"
import { linkToken, registrationToken } from "./token-vault"
import { renderVariables, type VariableContext } from "./message-template"
import { eventPublicUrl } from "./urls"
import { LIVE_STATUSES } from "./registration-capacity"
import { loadSectorFilter } from "./sector-filter-data"

const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })

export type TargetedEvent = { id: string; title: string; slug: string; organizationId: string; organization: { name: string; slug: string } }

/** One person to write to, whatever the audience: their shifts in it, and the link the email carries. */
export type Target = {
  volunteerId: string
  firstName: string
  email: string | null
  shifts: { label: string; date: string; startTime: string; endTime: string }[]
  editToken?: string
  signupUrl?: string
  waitlistOnly?: boolean
}

export type TargetedBuild = {
  recipients: Target[]
  label: string
  /** People left out because they answered « pas disponible » (#558), invited audience only. */
  declinedExcluded: number
  /**
   * A sector audience (#1170) whose sector is not an active sector of the event any more (archived,
   * unknown, another event's, or the event without sectors): nobody is written to, never everyone.
   */
  sectorGone: boolean
  vars: (r: Target) => VariableContext
  payloadFor: (r: Target, dedupeKey: string) => NotificationPayload
}

export const SECTOR_AUDIENCE_NOT_FOUND = "Secteur introuvable dans cet événement."

/**
 * Whether `sectorId` (an id or « autres ») is a sector audience the event offers now (#1170): the
 * event adopted sectors and the id is one of its active sectors. An archived sector or another
 * event's id answers false, with the same message: no existence leak, and never « everyone ».
 */
export async function sectorAudienceAvailable(db: OrgScopedPrisma, eventId: string, sectorId: string): Promise<boolean> {
  const sector = await loadSectorFilter(db, eventId, sectorId)
  return !!sector && sector.filter.kind !== "all"
}

/**
 * The recipients and emails of a targeted message (#396), computed from the event's current
 * registrations and invitations: shared by the immediate send (POST …/message) and the scheduled
 * one when it goes (#1019). Reads through the organisation-scoped client only.
 */
export async function buildTargetedMessage(
  db: OrgScopedPrisma,
  event: TargetedEvent,
  audience: Audience,
  subject: string,
  message: string,
): Promise<TargetedBuild> {
  const regs = await db.registration.findMany({
    where: { eventId: event.id, status: { in: [...LIVE_STATUSES] } },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })
  let recipients: Target[]
  let declinedExcluded = 0
  // A sector audience (#1170): the sector's postes read now, so a poste moved since follows its new sector.
  let sectorPostes: string[] = []
  let sectorName: string | undefined
  let sectorGone = false
  if (audience.kind === "sector") {
    const sector = await loadSectorFilter(db, event.id, audience.sectorId)
    if (!sector || sector.filter.kind === "all") sectorGone = true
    else {
      sectorPostes = sector.postes ?? []
      if (sector.filter.kind === "sector") sectorName = sector.filter.name
    }
  }
  if (audience.kind === "invited_without_shift") {
    const invites = await db.memberInvite.findMany({
      where: { eventId: event.id },
      select: { volunteerId: true, sentAt: true, declinedAt: true, tokenEnc: true, tokenLegacy: true, volunteer: { select: { firstName: true, email: true } } },
    })
    declinedExcluded = countDeclinedExcluded(invites, regs)
    recipients = selectInvitedWithoutShift(invites, regs).map(({ volunteerId, invite, waitlistOnly }) => {
      const url = new URL(eventPublicUrl(event.organization.slug, event.slug))
      const link = linkToken.reveal(invite)
      if (link) url.searchParams.set("token", link)
      return { volunteerId, firstName: invite.volunteer.firstName, email: invite.volunteer.email, shifts: [], signupUrl: url.toString(), waitlistOnly }
    })
  } else {
    recipients = selectRecipients(regs, audience, sectorPostes).map((r) => ({
      volunteerId: r.volunteerId,
      firstName: r.volunteer.firstName,
      email: r.volunteer.email,
      shifts: audience.kind === "waitlist" ? [] : r.registrations.map((x) => ({
        label: x.shift.label, date: fmtDate(x.shift.date), startTime: x.shift.startTime, endTime: x.shift.endTime,
      })),
      // The personal page only opens live confirmed registrations: a waitlist entry's link
      // would land on « introuvable », so the waitlist gets no link at all.
      editToken: audience.kind === "waitlist" ? undefined : registrationToken.reveal(r.registrations[0]),
    }))
  }

  const shiftName = audience.kind === "shift"
    ? (() => { const s = regs.find((r) => r.shiftId === audience.shiftId)?.shift; return s ? `${s.label} (${fmtDate(s.date)}, ${fmtRange(s.startTime, s.endTime)})` : undefined })()
    : undefined
  const label = audienceLabel(audience, shiftName, sectorName)
  const roleOfAudience = audience.kind === "role" ? audience.roleName : audience.kind === "shift" ? regs.find((x) => x.shiftId === audience.shiftId)?.shift.roleName : undefined
  const vars = (r: Target) => ({ prénom: r.firstName, événement: event.title, poste: roleOfAudience, créneau: shiftName })

  const payloadFor = (r: Target, dedupeKey: string): NotificationPayload => ({
    kind: "targeted_message",
    dedupeKey,
    recipient: { email: r.email, name: r.firstName },
    volunteerId: r.volunteerId,
    organizationId: event.organizationId,
    data: {
      volunteerName: r.firstName,
      organizationName: event.organization.name,
      orgSlug: event.organization.slug,
      eventTitle: event.title,
      subject: renderVariables(subject, vars(r)),
      message: renderVariables(message, vars(r)),
      shifts: r.shifts,
      editToken: r.editToken,
      signupUrl: r.signupUrl,
    },
  })

  return { recipients, label, declinedExcluded, sectorGone, vars, payloadFor }
}
