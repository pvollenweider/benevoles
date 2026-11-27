// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Alert to an organisation's administrators when an email to a volunteer has just failed for good
 * and that person has a confirmed shift soon (#1476). The nightly summary of addresses to verify
 * (#599) arrives after the event for a reminder sent the same day: on 2026-11-27 a day-of reminder
 * bounced at 09:00 for someone expected at 14:00, and the organisers had no way to know in time.
 *
 * Pure: no Prisma, no env. The loader (address-alert-data.ts) passes rows in.
 */

/** A shift counts as « soon » when it starts within this many hours: wide enough for the bounce of
 * the reminder sent two days before to give the organisers a day's notice. */
export const ADDRESS_ALERT_WINDOW_HOURS = 72

/** A first run, or a run whose predecessor is unknown, looks this far back. */
export const ADDRESS_ALERT_DEFAULT_LOOKBACK_MINUTES = 30

/** A run after a gap (deploy, restart) catches up, but never further back than this. */
export const ADDRESS_ALERT_MAX_LOOKBACK_HOURS = 6

/** Someone already refused in the hours before the window does not raise a second alert: the
 * organisers were told, or the address was already known. Twelve hours lets the bounce of the
 * day-of reminder alert again after the one of the day before. */
export const ADDRESS_ALERT_QUIET_HOURS = 12

/**
 * Where a run's window starts: the start of the previous run, so the windows follow each other
 * without a gap or an overlap, bounded by the maximum lookback.
 */
export function alertWindowStart(previousRunStartedAt: Date | null, now: Date): Date {
  const floor = now.getTime() - ADDRESS_ALERT_MAX_LOOKBACK_HOURS * 60 * 60 * 1000
  const previous = previousRunStartedAt?.getTime() ?? now.getTime() - ADDRESS_ALERT_DEFAULT_LOOKBACK_MINUTES * 60 * 1000
  return new Date(Math.min(now.getTime(), Math.max(previous, floor)))
}

export type AlertShift = { startsAt: Date; endsAt: Date; roleName: string; label: string | null; eventTitle: string }

/** The person's next confirmed shift when it starts within the window; null otherwise. A shift
 * already started is past helping. */
export function nextShiftSoon(shifts: AlertShift[], now: Date, windowHours: number = ADDRESS_ALERT_WINDOW_HOURS): AlertShift | null {
  const until = now.getTime() + windowHours * 60 * 60 * 1000
  return shifts
    .filter((s) => s.startsAt.getTime() > now.getTime() && s.startsAt.getTime() <= until)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null
}

export type AlertOutcome = { outcome: string; kind: string; createdAt: Date }

/**
 * What the recorded history says about this address, as a fact and nothing more: how many emails
 * it refused and since when, inside the retention window. Null for a single refusal (the alert
 * itself says it). Never « no email ever arrived »: the history is 30 days deep and an accepted
 * email proves nothing either way, so that claim could be false.
 */
export function refusalsText(outcomes: AlertOutcome[], timeZone: string): string | null {
  const rejected = outcomes.filter((o) => o.outcome === "rejected_permanent").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  if (rejected.length < 2) return null
  const since = new Intl.DateTimeFormat("fr-CH", { timeZone, day: "numeric", month: "long" }).format(rejected[0].createdAt)
  const confirmation = rejected.some((o) => o.kind === "registration_confirmation")
  return `Son adresse a refusé ${rejected.length} emails depuis le ${since}${confirmation ? ", dont la confirmation d'inscription" : ""}.`
}

const hour = (t: string) => {
  const [h, m = "00"] = t.split(":")
  return m === "00" ? `${parseInt(h, 10)} h` : `${parseInt(h, 10)} h ${m}`
}

/**
 * « aujourd'hui, vendredi 27 novembre, de 14 h à 16 h » in the organisation's zone. « aujourd'hui »
 * and « demain » come first: they are what makes an organiser pick up the phone.
 */
export function alertWhenText(shift: { startsAt: Date; startTime: string; endTime: string }, now: Date, timeZone: string): string {
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
  const day = new Intl.DateTimeFormat("fr-CH", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(shift.startsAt)
  const start = dayKey(shift.startsAt)
  const relative = start === dayKey(now) ? "aujourd'hui, " : start === dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000)) ? "demain, " : ""
  return `${relative}${day}, de ${hour(shift.startTime)} à ${hour(shift.endTime)}`
}

/** One email per organisation, recipient and day for the same set of people. */
export function addressAlertDedupeKey(organizationId: string, dayKey: string, recipientEmail: string, memberIds: string[]): string {
  return `address_to_verify_alert:${organizationId}:${dayKey}:${recipientEmail}:${[...memberIds].sort().join(",")}`
}

export type AddressAlertMember = {
  name: string
  /** As typed on the member's record; null when there is none. */
  phone: string | null
  eventTitle: string
  shiftName: string
  when: string
  /** A sentence on earlier refusals of the same address; null when this is the first on record. */
  refusals: string | null
}

export function addressAlertSubject(members: { name: string }[]): string {
  return members.length === 1
    ? `À joindre avant son créneau : ${members[0].name}`
    : `${members.length} bénévoles à joindre avant leur créneau`
}
