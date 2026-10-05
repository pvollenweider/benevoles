// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Chercher des bénévoles » (#566): from underfilled shifts, the members an organizer may write
 * to, each with the reasons they appear, and the email listing the open shifts. No score, no
 * ranking, nothing preselected: members are listed by name, the organizer ticks them by hand.
 * Pure, and safe in a client component (no database client imported here).
 */

import { AVAILABILITY_PERIODS, type AvailabilityPeriod } from "./availability"
import { clockTime, crossesMidnight, toMin, toMinEnd } from "./gantt-utils"
import { memberMayTake } from "./role-reservation"

export const OPEN_SHIFTS_MAX_SHIFTS = 20
export const OPEN_SHIFTS_MAX_RECIPIENTS = 200
export const OPEN_SHIFTS_NOTE_MAX = 500

/** Subject of the history row (#467); the email adds the event title in front. */
export const OPEN_SHIFTS_SUBJECT = "On cherche encore du monde"

type DateLike = Date | string

/** A shift of the event, as the overlap and the labels need it. `date` is Shift.date (UTC midnight) or "YYYY-MM-DD". */
export type EventShiftRef = { id: string; roleName: string; label: string; date: DateLike; startTime: string; endTime: string }

/** An underfilled shift the organizer picked: places left, and the tags its role is reserved to (#470). */
export type OpenShift = EventShiftRef & { placesLeft: number; reservedTags?: string[] }

export type PoolMember = {
  id: string
  firstName: string
  lastName: string
  hasEmail: boolean
  active: boolean
  tags: string[]
  availabilityPeriods?: string[] | null
  availabilityNote?: string | null
}

/** A live registration (active, requested, waiting or offered) of a member on this event. */
export type LiveRegistration = { volunteerId: string; shiftId: string; status: string }

/** The member's invitation to this event (one per member and event), if any. */
export type InviteRef = { volunteerId: string; declined: boolean }

// ── Time ────────────────────────────────────────────────────────────────────

const isoDay = (d: DateLike) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/**
 * Absolute wall-clock minutes of a shift, the way shiftsOverlap reads them: the date's day plus the
 * start, the end on the next day when it is at or before the start (night shifts). Wall clock, not
 * elapsed time: a shift on a daylight saving night still reads as its printed hours.
 */
export function shiftInterval(s: { date: DateLike; startTime: string; endTime: string }): { start: number; end: number } {
  const day = Date.parse(`${isoDay(s.date)}T00:00:00Z`) / 60000
  return { start: day + toMin(s.startTime), end: day + toMinEnd(s.endTime, s.startTime) }
}

/** Minutes two shifts have in common; > 0 exactly when shiftsOverlap says they overlap. */
export function overlapMinutes(a: { date: DateLike; startTime: string; endTime: string }, b: { date: DateLike; startTime: string; endTime: string }): number {
  const x = shiftInterval(a)
  const y = shiftInterval(b)
  return Math.max(0, Math.min(x.end, y.end) - Math.max(x.start, y.start))
}

// Morning 06:00 to 12:00, afternoon 12:00 to 18:00, evening 18:00 to 06:00 (the night belongs to the
// evening). Minutes from the start of the shift's day, over that day and the next.
const PERIOD_WINDOWS: [AvailabilityPeriod, number, number][] = [
  ["evening", -360, 360],
  ["morning", 360, 720],
  ["afternoon", 720, 1080],
  ["evening", 1080, 1800],
  ["morning", 1800, 2160],
  ["afternoon", 2160, 2520],
  ["evening", 2520, 3240],
]

/** The periods of the day (#402) a shift touches, in the usual order. */
export function shiftPeriods(s: { startTime: string; endTime: string }): AvailabilityPeriod[] {
  const start = toMin(s.startTime)
  const end = toMinEnd(s.endTime, s.startTime)
  const touched = new Set(PERIOD_WINDOWS.filter(([, from, to]) => Math.min(end, to) > Math.max(start, from)).map(([p]) => p))
  return AVAILABILITY_PERIODS.map((p) => p.id).filter((p) => touched.has(p))
}

export type AvailabilityFit = "unknown" | "match" | "partial" | "no_match"

/**
 * How a member's general availability (#402) compares with a shift's hours: indicative only, read
 * by the organizer, never a filter or a confirmation. « unknown » when no period is set.
 */
export function availabilityFit(member: { availabilityPeriods?: string[] | null }, shift: { startTime: string; endTime: string }): AvailabilityFit {
  const mine = new Set(member.availabilityPeriods ?? [])
  if (mine.size === 0) return "unknown"
  const needed = shiftPeriods(shift)
  const covered = needed.filter((p) => mine.has(p)).length
  if (covered === needed.length) return "match"
  return covered > 0 ? "partial" : "no_match"
}

// ── Candidates ──────────────────────────────────────────────────────────────

export type ShiftFit = {
  shiftId: string
  /**
   * offer: the email lists it. registered: already on it (any live status). overlap: one of the
   * member's registrations on the event overlaps it, even by a few minutes; sign-up would refuse it.
   * reserved: its role is reserved to tags the member doesn't carry.
   */
  status: "offer" | "registered" | "overlap" | "reserved"
  overlap?: { shift: EventShiftRef; minutes: number; status: string }
  availability: AvailabilityFit
}

export type Candidate = {
  member: PoolMember
  /** Ids of the selected shifts the email would list for this person, in the selection's order. */
  offer: string[]
  fits: ShiftFit[]
  /** At least one shift to offer. Never preselected: the organizer ticks each person. */
  selectable: boolean
  /** Their confirmed shifts (active or requested) on this event. */
  registeredShifts: EventShiftRef[]
  invite: "none" | "pending" | "declined"
  /**
   * The link the email carries. invitation: their existing invitation link. new_invitation: an
   * invitation is created (MemberInvite, one per member and event). event: the event page, plus
   * their personal page, for members already registered without an invitation.
   */
  link: "invitation" | "new_invitation" | "event"
}

export type Exclusions = {
  inactive: number
  noEmail: number
  /** Answered « pas disponible » to their invitation (#558); shown only when asked. */
  declined: number
  /** Already on every selected shift (or only on ones reserved to others). */
  alreadyOnShifts: number
  /** Nothing to offer because every selected shift's role is reserved to other tags. */
  reserved: number
}

const tagKey = (t: string) => t.trim().toLocaleLowerCase("fr")
const BOOKED = new Set(["active", "requested"])

export function findCandidates(input: {
  shifts: OpenShift[]
  /** Every non-cancelled shift of the event, for the overlaps and the « déjà inscrit » line. */
  eventShifts: EventShiftRef[]
  members: PoolMember[]
  registrations: LiveRegistration[]
  invites: InviteRef[]
  /** Only members carrying this tag (case-insensitive); empty: everyone. */
  tag?: string
  includeDeclined?: boolean
}): { candidates: Candidate[]; excluded: Exclusions } {
  const excluded: Exclusions = { inactive: 0, noEmail: 0, declined: 0, alreadyOnShifts: 0, reserved: 0 }
  const eventShifts = new Map(input.eventShifts.map((s) => [s.id, s]))
  const regsOf = new Map<string, LiveRegistration[]>()
  for (const r of input.registrations) regsOf.set(r.volunteerId, [...(regsOf.get(r.volunteerId) ?? []), r])
  const inviteOf = new Map(input.invites.map((i) => [i.volunteerId, i]))
  const tag = input.tag?.trim() ? tagKey(input.tag) : null

  const candidates: Candidate[] = []
  for (const member of input.members) {
    if (tag && !member.tags.some((t) => tagKey(t) === tag)) continue
    if (!member.active) { excluded.inactive++; continue }
    if (!member.hasEmail) { excluded.noEmail++; continue }
    const invite = inviteOf.get(member.id)
    if (invite?.declined && !input.includeDeclined) { excluded.declined++; continue }

    const regs = regsOf.get(member.id) ?? []
    const fits: ShiftFit[] = input.shifts.map((shift) => {
      const availability = availabilityFit(member, shift)
      if (regs.some((r) => r.shiftId === shift.id)) return { shiftId: shift.id, status: "registered", availability }
      if (!memberMayTake(member.tags, shift.reservedTags ?? [])) return { shiftId: shift.id, status: "reserved", availability }
      let overlap: ShiftFit["overlap"]
      for (const r of regs) {
        const other = eventShifts.get(r.shiftId)
        if (!other) continue
        const minutes = overlapMinutes(other, shift)
        if (minutes > 0 && (!overlap || minutes > overlap.minutes)) overlap = { shift: other, minutes, status: r.status }
      }
      if (overlap) return { shiftId: shift.id, status: "overlap", overlap, availability }
      return { shiftId: shift.id, status: "offer", availability }
    })

    const offer = fits.filter((f) => f.status === "offer").map((f) => f.shiftId)
    if (offer.length === 0 && !fits.some((f) => f.status === "overlap")) {
      if (fits.some((f) => f.status === "registered")) excluded.alreadyOnShifts++
      else excluded.reserved++
      continue
    }

    const registeredShifts = regs
      .filter((r) => BOOKED.has(r.status))
      .map((r) => eventShifts.get(r.shiftId))
      .filter((s): s is EventShiftRef => !!s)
      .sort((a, b) => shiftInterval(a).start - shiftInterval(b).start)
    const offersReserved = offer.some((id) => (input.shifts.find((s) => s.id === id)?.reservedTags ?? []).length > 0)
    candidates.push({
      member,
      offer,
      fits,
      selectable: offer.length > 0,
      registeredShifts,
      invite: invite ? (invite.declined ? "declined" : "pending") : "none",
      // A reserved role is only bookable through an invitation (#470): they get one then.
      link: invite ? "invitation" : registeredShifts.length > 0 && !offersReserved ? "event" : "new_invitation",
    })
  }

  candidates.sort((a, b) => a.member.lastName.localeCompare(b.member.lastName, "fr") || a.member.firstName.localeCompare(b.member.firstName, "fr"))
  return { candidates, excluded }
}

/** The selected members that may really be written to, recomputed from the candidates (server side). */
export function selectedRecipients(candidates: Candidate[], selectedIds: string[]): Candidate[] {
  const wanted = new Set(selectedIds)
  return candidates.filter((c) => c.selectable && wanted.has(c.member.id))
}

// ── Words ───────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « Bar », or « Bar (Service du soir) » when the shift has its own label. */
export function shiftName(s: { roleName: string; label: string }): string {
  return s.label && s.label !== s.roleName ? `${s.roleName} (${s.label})` : s.roleName
}

/** « samedi 14 juin » (Shift.date is a UTC midnight). */
export function shiftDay(date: DateLike, weekday: "long" | "short" = "long"): string {
  return new Date(`${isoDay(date)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday, day: "numeric", month: weekday === "long" ? "long" : "short" })
}

/** « de 22:00 à 02:00 le lendemain ». */
export function shiftHours(s: { startTime: string; endTime: string }): string {
  return `de ${clockTime(s.startTime)} à ${clockTime(s.endTime)}${crossesMidnight(s.startTime, s.endTime) ? " le lendemain" : ""}`
}

export const placesLeftLabel = (n: number) => plural(n, "place libre", "places libres")

/** One open shift for the email and the history: « Bar (Soir) : samedi 14 juin, de 22:00 à 02:00 le lendemain, 2 places libres ». */
export function openShiftLine(s: OpenShift): string {
  return `${shiftName(s)} : ${shiftDay(s.date)}, ${shiftHours(s)}, ${placesLeftLabel(s.placesLeft)}`
}

/** « les membres choisis pour 2 créneaux à compléter », for the history and the event log. */
export function openShiftsAudienceLabel(shiftCount: number): string {
  return `les membres choisis pour ${plural(shiftCount, "créneau à compléter", "créneaux à compléter")}`
}

/** The history row of a send (#467): what an organizer reads later in « Messages envoyés ». */
export function openShiftsHistory(shifts: OpenShift[], note?: string | null): { subject: string; message: string; audienceLabel: string } {
  const list = ["Créneaux proposés :", ...shifts.map((s) => `- ${openShiftLine(s)}`)].join("\n")
  const text = note?.trim()
  return { subject: OPEN_SHIFTS_SUBJECT, message: text ? `${text}\n\n${list}` : list, audienceLabel: openShiftsAudienceLabel(shifts.length) }
}

const fitWords: Record<Exclude<AvailabilityFit, "unknown">, string> = {
  match: "compatible avec l'horaire",
  partial: "en partie compatible avec l'horaire",
  no_match: "pas compatible avec l'horaire",
}

/**
 * The visible reasons a member is listed, from existing data only: tags, general availability
 * (labelled indicative), registrations on this event, overlaps, reserved roles and invitation.
 */
export function candidateReasons(c: Candidate, shifts: OpenShift[]): string[] {
  const byId = new Map(shifts.map((s) => [s.id, s]))
  const single = shifts.length === 1
  const out: string[] = []
  if (c.member.tags.length > 0) out.push(`Tags : ${c.member.tags.join(", ")}`)

  // Not availabilityLabel: its « · » separator stays out of this copy.
  const periods = AVAILABILITY_PERIODS.filter((p) => c.member.availabilityPeriods?.includes(p.id)).map((p) => p.label.toLocaleLowerCase("fr"))
  const availabilityNote = c.member.availabilityNote?.trim()
  const availability = [
    periods.length > 0 ? `${periods.join(", ").charAt(0).toUpperCase()}${periods.join(", ").slice(1)}` : "",
    availabilityNote ? `« ${availabilityNote} »` : "",
  ].filter(Boolean).join(", ")
  if (availability) {
    const known = c.fits.filter((f) => f.availability !== "unknown")
    let fit = ""
    if (known.length > 0) {
      if (single) fit = `, ${fitWords[known[0].availability as keyof typeof fitWords]} de ce créneau`
      else {
        const matching = known.filter((f) => f.availability === "match").length
        fit = `, compatible avec l'horaire de ${matching} des ${shifts.length} créneaux choisis`
      }
    }
    out.push(`Disponibilité générale (indicative) : ${availability}${fit}`)
  }

  if (c.registeredShifts.length > 0) out.push(`Déjà inscrit à cet événement (${plural(c.registeredShifts.length, "créneau", "créneaux")})`)

  for (const f of c.fits) {
    const s = byId.get(f.shiftId)
    if (!s) continue
    const which = single ? "ce créneau" : `${shiftName(s)}, ${shiftDay(s.date, "short")}`
    if (f.status === "overlap" && f.overlap) {
      const o = f.overlap
      out.push(`Chevauchement : son inscription ${shiftName(o.shift)} (${shiftDay(o.shift.date, "short")}, ${shiftHours(o.shift)}) a ${o.minutes} min en commun avec ${which}, qui ne lui sera pas proposé`)
    } else if (f.status === "registered") {
      out.push(`Déjà sur ${which} : pas proposé à nouveau`)
    } else if (f.status === "reserved") {
      out.push(`${which.charAt(0).toUpperCase()}${which.slice(1)} : poste réservé à d'autres tags, pas proposé`)
    }
  }

  if (c.invite === "declined") out.push("A répondu « pas disponible » à son invitation")
  else if (c.invite === "pending") out.push("Déjà invité à cet événement")
  else if (c.link === "new_invitation") out.push("Pas encore invité : une invitation sera créée avec l'email")
  return out
}

/** « 3 inactifs, 2 sans email… »: who was left out of the list and why, or null if no one. */
export function exclusionSentence(e: Exclusions): string | null {
  const parts = [
    e.inactive > 0 ? plural(e.inactive, "membre inactif", "membres inactifs") : null,
    e.noEmail > 0 ? plural(e.noEmail, "membre sans email", "membres sans email") : null,
    e.declined > 0 ? `${plural(e.declined, "membre qui a", "membres qui ont")} répondu « pas disponible »` : null,
    e.alreadyOnShifts > 0 ? `${plural(e.alreadyOnShifts, "membre déjà inscrit", "membres déjà inscrits")} sur ces créneaux` : null,
    e.reserved > 0 ? `${plural(e.reserved, "membre", "membres")} sans le tag des postes réservés` : null,
  ].filter(Boolean)
  return parts.length > 0 ? `Non proposés : ${parts.join(", ")}.` : null
}
