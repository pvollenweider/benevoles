// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { NO_SECTOR_LABEL } from "./sectors"
import { SECTOR_FILTER_OTHERS, SECTOR_FILTER_PARAM } from "./sector-filter"

/**
 * Targeted messages (#396): a subject and a plain-text message to the volunteers of an event,
 * a role, a shift, or the waitlist only. One email per person, whatever the number of their
 * shifts in the audience. No campaigns, segments or HTML editor.
 */

export const MESSAGE_SUBJECT_MAX = 120
export const MESSAGE_BODY_MAX = 2000
/** Messages per organization per hour, all events together. */
export const MESSAGE_RATE_LIMIT = 30

export const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event") }),
  z.object({ kind: z.literal("role"), roleName: z.string().min(1) }),
  z.object({ kind: z.literal("shift"), shiftId: z.string().min(1) }),
  // The confirmed people of the postes of one sector at send time (#1170): an active sector's id,
  // or « autres » for « Autres postes ». Only once the event adopted sectors.
  z.object({ kind: z.literal("sector"), sectorId: z.string().min(1).max(100) }),
  z.object({ kind: z.literal("waitlist") }),
  // Invited members of the event with no confirmed shift (#481), waitlist-only people included.
  z.object({ kind: z.literal("invited_without_shift") }),
])
export type Audience = z.infer<typeof audienceSchema>

export const messageSchema = z.object({
  audience: audienceSchema,
  subject: z.string().trim().min(1, "L'objet est obligatoire.").max(MESSAGE_SUBJECT_MAX),
  message: z.string().trim().min(1, "Le message est obligatoire.").max(MESSAGE_BODY_MAX),
  /** Count and preview only, nothing sent. */
  dryRun: z.boolean().optional(),
  /** Also a push notification to the recipients' subscribed devices (#468); the email always goes. */
  push: z.boolean().optional(),
})

export const PUSH_TITLE_MAX = 60
export const PUSH_BODY_MAX = 120

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

/**
 * The push of a targeted message (#468): the subject as title, the first non-empty line of the
 * message as body, both short; the full text stays in the email.
 */
export function messagePushPayload(subject: string, message: string): { title: string; body: string } {
  const firstLine = message.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ""
  return { title: clip(subject.trim(), PUSH_TITLE_MAX), body: clip(firstLine, PUSH_BODY_MAX) }
}
export type MessageInput = z.infer<typeof messageSchema>

export type RecipientRegistration = {
  volunteerId: string
  shiftId: string
  status: string
  volunteer: { firstName: string; lastName: string; email: string | null; active?: boolean }
  shift: { roleName: string; label: string; date: Date | string; startTime: string; endTime: string }
}

export type Recipient<R extends RecipientRegistration = RecipientRegistration> = {
  volunteerId: string
  volunteer: R["volunteer"]
  /** The registrations of this person in the audience, first one first. */
  registrations: R[]
}

/**
 * Live statuses of the audience: confirmed people, or the waitlist (waiting and offered). A
 * sector audience keeps the confirmed people of `sectorPostes`, the sector's postes resolved at
 * send time (src/lib/sector-filter-data.ts); none when they are not given.
 */
function inAudience(r: RecipientRegistration, audience: Audience, sectorPostes: ReadonlySet<string>): boolean {
  switch (audience.kind) {
    case "event": return r.status === "active"
    case "sector": return r.status === "active" && sectorPostes.has(r.shift.roleName)
    case "role": return r.status === "active" && r.shift.roleName === audience.roleName
    case "shift": return r.status === "active" && r.shiftId === audience.shiftId
    case "waitlist": return r.status === "waiting" || r.status === "offered"
    // Built from the invitations, not the registrations: see selectInvitedWithoutShift.
    case "invited_without_shift": return false
  }
}

/**
 * The people to write to, one entry per volunteer with an email, in the registrations' order.
 * Inactive members are still written to: they are registered on this event.
 */
export function selectRecipients<R extends RecipientRegistration>(registrations: R[], audience: Audience, sectorPostes: readonly string[] = []): Recipient<R>[] {
  const byVolunteer = new Map<string, Recipient<R>>()
  const postes = new Set(sectorPostes)
  for (const r of registrations) {
    if (!inAudience(r, audience, postes) || !r.volunteer.email) continue
    const entry = byVolunteer.get(r.volunteerId)
    if (entry) entry.registrations.push(r)
    else byVolunteer.set(r.volunteerId, { volunteerId: r.volunteerId, volunteer: r.volunteer, registrations: [r] })
  }
  return Array.from(byVolunteer.values())
}

/** « les 12 bénévoles inscrits », « les 3 bénévoles du poste Bar »… for confirmations and the log. */
export function audienceLabel(audience: Audience, shiftName?: string, sectorName?: string): string {
  switch (audience.kind) {
    case "event": return "tous les bénévoles inscrits"
    case "sector": return audience.sectorId === SECTOR_FILTER_OTHERS ? `les bénévoles des « ${NO_SECTOR_LABEL} »` : `les bénévoles du secteur « ${sectorName ?? audience.sectorId} »`
    case "role": return `les bénévoles du poste « ${audience.roleName} »`
    case "shift": return `les bénévoles du créneau ${shiftName ?? audience.shiftId}`
    case "waitlist": return "les personnes en liste d'attente"
    case "invited_without_shift": return "les invités sans créneau confirmé"
  }
}

export type InvitedWithoutShift<I> = {
  volunteerId: string
  invite: I
  /** Only on the waitlist (waiting or offered) for this event. */
  waitlistOnly: boolean
}

/**
 * « Invités sans créneau confirmé » (#481): members invited to the event (any invitation, used or
 * not) with an email and no active registration on it, one entry per person (their latest
 * invitation). People who answered « pas disponible » are left out (#558): they already said no,
 * relaunching or writing to them again would be exactly what the feature exists to avoid.
 * Recomputed at send time, like every audience.
 */
export function selectInvitedWithoutShift<I extends { volunteerId: string; sentAt: Date; declinedAt?: Date | null; volunteer: { email: string | null } }>(
  invites: I[],
  registrations: { volunteerId: string; status: string }[],
): InvitedWithoutShift<I>[] {
  const active = new Set(registrations.filter((r) => r.status === "active").map((r) => r.volunteerId))
  const waiting = new Set(registrations.filter((r) => r.status === "waiting" || r.status === "offered").map((r) => r.volunteerId))
  const latest = new Map<string, I>()
  for (const i of invites) {
    if (!i.volunteer.email || active.has(i.volunteerId) || i.declinedAt) continue
    const prev = latest.get(i.volunteerId)
    if (!prev || i.sentAt > prev.sentAt) latest.set(i.volunteerId, i)
  }
  return [...latest.values()].map((invite) => ({ volunteerId: invite.volunteerId, invite, waitlistOnly: waiting.has(invite.volunteerId) }))
}

/** People left out of `selectInvitedWithoutShift` only because they declined (#558), for the preview/confirmation. */
export function countDeclinedExcluded<I extends { volunteerId: string; declinedAt?: Date | null }>(
  invites: I[],
  registrations: { volunteerId: string; status: string }[],
): number {
  const active = new Set(registrations.filter((r) => r.status === "active").map((r) => r.volunteerId))
  return new Set(invites.filter((i) => i.declinedAt && !active.has(i.volunteerId)).map((i) => i.volunteerId)).size
}

/** Audience from the query string of the message page (`?shift=`, `?role=`, `?secteur=`, `?audience=waitlist`). */
export function audienceFromQuery(q: { shift?: string; role?: string; audience?: string; secteur?: string }): Audience {
  if (q.shift) return { kind: "shift", shiftId: q.shift }
  if (q.role) return { kind: "role", roleName: q.role }
  if (q.secteur) return { kind: "sector", sectorId: q.secteur }
  if (q.audience === "waitlist") return { kind: "waitlist" }
  if (q.audience === "invited") return { kind: "invited_without_shift" }
  return { kind: "event" }
}

/**
 * The « Écrire aux bénévoles » link of the registrations list: the narrowest filter shown there
 * wins (créneau, then poste, then the page's « Secteur » filter, #1170), else everyone.
 */
export function messagePageHref(eventId: string, f: { shiftId?: string; roleName?: string; sector?: string }): string {
  const base = `/admin/events/${eventId}/message`
  if (f.shiftId) return `${base}?shift=${encodeURIComponent(f.shiftId)}`
  if (f.roleName) return `${base}?role=${encodeURIComponent(f.roleName)}`
  if (f.sector) return `${base}?${SECTOR_FILTER_PARAM}=${encodeURIComponent(f.sector)}`
  return base
}

/** The link's text for a sector (#1170), naming it: « Écrire au secteur Parking », « Écrire aux « Autres postes » ». */
export function writeToSectorLabel(sector: { value: string; label: string }): string {
  return sector.value === SECTOR_FILTER_OTHERS ? `Écrire aux « ${NO_SECTOR_LABEL} »` : `Écrire au secteur ${sector.label}`
}
