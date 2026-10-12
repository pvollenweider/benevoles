// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { toMin, toMinEnd } from "./gantt-utils"
import { localDateTimeToUtc } from "./time-zone"
import { contactText, onSiteContact, ORG_CONTACT_LABEL, sectorLeaderLabel, telHref, type ShiftInfo } from "./shift-info"

/**
 * Volunteer self-cancellation (#946). Pure (no Prisma): shared by the DELETE route (the source of
 * truth), the personal page, the public event page, the emails and the event settings form.
 *
 * - Every event, by default: a volunteer can cancel by themself until their shift starts, never
 *   after (a started or ended shift can't be withdrawn from the personal link any more).
 * - Optional per event: an earlier deadline, N days and/or hours before each shift's start, for a
 *   confirmed place only. Days are calendar days in the organisation's zone (the same wall-clock
 *   time, across a daylight-saving change), hours a duration on top.
 * - A waitlist entry, an offered spot and a pending request hold no confirmed place: they can be
 *   left until the shift starts, whatever the earlier deadline.
 * - Removal by an admin or owner is never limited by any of this.
 */

export const CANCEL_DEADLINE_DAYS_MAX = 60
export const CANCEL_DEADLINE_HOURS_MAX = 23

/** The event's setting: both null (or 0) = until the shift starts. */
export type CancelDeadlineSetting = { cancelDeadlineDays?: number | null; cancelDeadlineHours?: number | null }

/** A shift's calendar day (midnight UTC, as stored, or its ISO string) and wall-clock times. */
export type ShiftWhen = { date: Date | string; startTime: string; endTime?: string }

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

const whole = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

/** Whether the event sets a deadline earlier than the shift's start. */
export function hasEarlierDeadline(s: CancelDeadlineSetting | null | undefined): boolean {
  return whole(s?.cancelDeadlineDays) + whole(s?.cancelDeadlineHours) > 0
}

const dayOf = (date: Date | string) => {
  const d = typeof date === "string" ? new Date(date) : date
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/** The real instant a shift starts, in the organisation's zone. */
export function shiftStartsAt(shift: ShiftWhen, timeZone: string): Date {
  return localDateTimeToUtc(dayOf(shift.date), shift.startTime, timeZone)
}

/** The real instant a shift ends: an end before its start is the next morning (22:00 to 02:00). */
export function shiftEndsAt(shift: ShiftWhen, timeZone: string): Date {
  if (!shift.endTime) return shiftStartsAt(shift, timeZone)
  return localDateTimeToUtc(dayOf(shift.date), clock(toMinEnd(shift.endTime, shift.startTime)), timeZone)
}

/**
 * The last instant a confirmed volunteer can cancel by themself: the shift's start, or the
 * earlier deadline the event sets. « 2 days » is the same wall-clock time two calendar days before.
 */
export function selfCancelDeadline(shift: ShiftWhen, setting: CancelDeadlineSetting | null | undefined, timeZone: string): Date {
  const days = whole(setting?.cancelDeadlineDays)
  const hours = whole(setting?.cancelDeadlineHours)
  if (days === 0 && hours === 0) return shiftStartsAt(shift, timeZone)
  const day = new Date(dayOf(shift.date).getTime() - days * DAY_MS)
  return new Date(localDateTimeToUtc(day, clock(toMin(shift.startTime)), timeZone).getTime() - hours * HOUR_MS)
}

export type SelfCancelReason = "started" | "ended" | "deadline"

export type SelfCancelState =
  /** `deadline`: the earlier deadline that applies to this registration, else null (until the start). */
  | { allowed: true; deadline: Date | null }
  | { allowed: false; reason: SelfCancelReason }

/**
 * Whether the volunteer can still cancel this registration by themself at `now`. Refused from the
 * shift's start (« ended » once it is over too); a confirmed place (`active`) is also refused from
 * the event's earlier deadline. Other live statuses (waiting, offered, requested) only stop at the start.
 */
export function selfCancelState(input: {
  status: string
  shift: ShiftWhen
  setting?: CancelDeadlineSetting | null
  timeZone: string
  now: Date
}): SelfCancelState {
  const { status, shift, setting, timeZone, now } = input
  const t = now.getTime()
  if (t >= shiftStartsAt(shift, timeZone).getTime()) {
    return { allowed: false, reason: t >= shiftEndsAt(shift, timeZone).getTime() ? "ended" : "started" }
  }
  if (status !== "active" || !hasEarlierDeadline(setting)) return { allowed: true, deadline: null }
  const deadline = selfCancelDeadline(shift, setting, timeZone)
  return t >= deadline.getTime() ? { allowed: false, reason: "deadline" } : { allowed: true, deadline }
}

// ── Late withdrawals ───────────────────────────────────────────────────────

/** A withdrawal this close to the shift's start is urgent: told at once, not grouped (#946). */
export const LATE_WITHDRAWAL_MS = 24 * HOUR_MS

/** Whether a withdrawal at `now` is « de dernière minute »: less than 24 hours before the start. */
export function isLateWithdrawal(shiftStart: Date, now: Date): boolean {
  const left = shiftStart.getTime() - now.getTime()
  return left > 0 && left < LATE_WITHDRAWAL_MS
}

// ── Words ───────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « 2 jours », « 4 heures », « 1 jour et 6 heures »; null without an earlier deadline. */
export function cancelDeadlineLabel(s: CancelDeadlineSetting | null | undefined): string | null {
  const days = whole(s?.cancelDeadlineDays)
  const hours = whole(s?.cancelDeadlineHours)
  const parts = [days ? plural(days, "jour", "jours") : "", hours ? plural(hours, "heure", "heures") : ""].filter(Boolean)
  return parts.length ? parts.join(" et ") : null
}

/** The rule in one sentence for the confirmation email; null when it is the default (until the start). */
export function cancelPolicySentence(s: CancelDeadlineSetting | null | undefined): string | null {
  const label = cancelDeadlineLabel(s)
  return label ? `Tu peux annuler toi-même jusqu'à ${label} avant le début de chaque créneau. Passé ce délai, préviens l'organisation.` : null
}

/** « samedi 4 juillet à 08:00 », in the organisation's zone. */
export function deadlineMoment(at: Date, timeZone: string): string {
  const day = at.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" })
  const time = at.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
  return `${day} à ${time}`
}

/** Under a confirmed shift with an earlier deadline still ahead. */
export function cancelUntilText(deadline: Date, timeZone: string): string {
  return `Tu peux annuler toi-même jusqu'au ${deadlineMoment(deadline, timeZone)}.`
}

/** Why the cancel button is gone, on the personal page. */
export function cancelClosedText(reason: SelfCancelReason): string {
  if (reason === "ended") return "Ce créneau est terminé."
  if (reason === "started") return "Ce créneau a commencé : il ne peut plus être annulé en ligne."
  return "Le délai pour annuler toi-même ce créneau est passé."
}

/** On the public event page, under a held shift that can't be cancelled online any more. */
export const CANCEL_CLOSED_SHORT = "Plus annulable en ligne : vois les contacts sur ta page personnelle."

/** The line before the contacts, when the volunteer can't cancel online any more. */
export const CANCEL_CONTACTS_INTRO = "Si tu ne peux pas venir, préviens directement :"

export type CancelContact = { label: string; text: string; href?: string }

/**
 * Whom to tell when the volunteer can't cancel online any more (#946), in this order: the role's
 * sector leaders (by name only, #560), the shift's or the day-of contact, the organisation's email.
 * Only what the personal page already has: a waitlist entry or a pending request gets the email.
 */
export function cancelContacts(info: ShiftInfo, contactEmail: string | null | undefined): CancelContact[] {
  const out: CancelContact[] = []
  const leaders = (info.sectorLeaderNames ?? []).map((n) => n.trim()).filter(Boolean)
  if (leaders.length) out.push({ label: sectorLeaderLabel(leaders.length), text: leaders.join(", ") })
  const onSite = onSiteContact(info)
  if (onSite) out.push({ label: onSite.label, text: contactText(onSite), ...(onSite.phone ? { href: telHref(onSite.phone) } : {}) })
  const email = contactEmail?.trim()
  if (email) out.push({ label: ORG_CONTACT_LABEL, text: email, href: `mailto:${email}` })
  return out
}

/** The refusal of the DELETE route (409), for a page loaded before the deadline or the start. */
export function cancelRefusedError(reason: SelfCancelReason): string {
  if (reason === "deadline") return "Le délai pour annuler toi-même ce créneau est passé : rien n'a été annulé. Préviens directement l'organisation ou le responsable du poste."
  if (reason === "ended") return "Ce créneau est terminé : rien n'a été annulé."
  return "Ce créneau a déjà commencé : rien n'a été annulé. Préviens directement l'organisation ou le responsable du poste."
}

/**
 * The cancellation line of an automatic reminder, for the group's first shift; null without an
 * earlier deadline. Says the date while it is ahead, and who to tell once it has passed.
 */
export function reminderCancelNotice(shift: ShiftWhen, setting: CancelDeadlineSetting | null | undefined, timeZone: string, now: Date): string | null {
  if (!hasEarlierDeadline(setting)) return null
  const deadline = selfCancelDeadline(shift, setting, timeZone)
  return now.getTime() < deadline.getTime()
    ? `${cancelUntilText(deadline, timeZone)} Passé ce délai, préviens l'organisation.`
    : "Le délai pour annuler toi-même est passé : en cas d'empêchement, préviens directement l'organisation."
}

// ── Settings form and API ───────────────────────────────────────────────────

/** The form's choice: until the start, or an earlier deadline typed as days and hours. */
export type CancelDeadlineForm = { mode: "start" | "before"; days: string; hours: string }

export function cancelDeadlineFormFrom(s: CancelDeadlineSetting | null | undefined): CancelDeadlineForm {
  const days = whole(s?.cancelDeadlineDays)
  const hours = whole(s?.cancelDeadlineHours)
  return days || hours ? { mode: "before", days: days ? String(days) : "", hours: hours ? String(hours) : "" } : { mode: "start", days: "", hours: "" }
}

export type CancelDeadlineErrors = { days?: string; hours?: string; total?: string }

const parseCount = (raw: string): number | null => (raw.trim() === "" ? 0 : /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null)

/** Field errors of the form; empty when it can be saved. An empty field counts as 0. */
export function cancelDeadlineFormErrors(f: CancelDeadlineForm): CancelDeadlineErrors {
  if (f.mode === "start") return {}
  const errors: CancelDeadlineErrors = {}
  const days = parseCount(f.days)
  const hours = parseCount(f.hours)
  if (days === null || days > CANCEL_DEADLINE_DAYS_MAX) errors.days = `Nombre de jours entier, de 0 à ${CANCEL_DEADLINE_DAYS_MAX}.`
  if (hours === null || hours > CANCEL_DEADLINE_HOURS_MAX) errors.hours = `Nombre d'heures entier, de 0 à ${CANCEL_DEADLINE_HOURS_MAX}. Au-delà, utilisez les jours.`
  if (!errors.days && !errors.hours && days === 0 && hours === 0) errors.total = "Indiquez au moins un jour ou une heure, ou choisissez « Jusqu'au début du créneau »."
  return errors
}

/** The body fields for a valid form; null while it has errors (nothing is sent for them). */
export function cancelDeadlinePayload(f: CancelDeadlineForm): { cancelDeadlineDays: number | null; cancelDeadlineHours: number | null } | null {
  if (f.mode === "start") return { cancelDeadlineDays: null, cancelDeadlineHours: null }
  if (Object.keys(cancelDeadlineFormErrors(f)).length > 0) return null
  return { cancelDeadlineDays: parseCount(f.days) || null, cancelDeadlineHours: parseCount(f.hours) || null }
}
