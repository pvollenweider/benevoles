// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ACCEPTANCE_PROOF_HOURS } from "./address-status"

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

/** How far back each run looks for new permanent failures. The run is every 15 minutes; the
 * overlap is absorbed by the outbox dedupe key (same people, same day: one email). */
export const ADDRESS_ALERT_LOOKBACK_MINUTES = 30

export type AlertShift = { startsAt: Date; endsAt: Date; roleName: string; label: string | null; eventTitle: string }

/** The person's next confirmed shift when it starts within the window; null otherwise. A shift
 * already started is past helping. */
export function nextShiftSoon(shifts: AlertShift[], now: Date, windowHours: number = ADDRESS_ALERT_WINDOW_HOURS): AlertShift | null {
  const until = now.getTime() + windowHours * 60 * 60 * 1000
  return shifts
    .filter((s) => s.startsAt.getTime() > now.getTime() && s.startsAt.getTime() <= until)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null
}

export type AlertOutcome = { outcome: string; createdAt: Date; outboxId: string | null; messageRef: string | null }

/**
 * Whether nothing we sent to this address is known to have arrived: at least one permanent
 * rejection, and every email our relay accepted either bounced (a rejection carries the same
 * outbox row or the same direct reference) or is too recent to count as delivered. Said only when
 * it holds for every recorded email of the address: an old acceptance with no bounce on record
 * makes it false, even if that email was in fact lost.
 */
export function neverReached(outcomes: AlertOutcome[], now: Date): boolean {
  const rejected = outcomes.filter((o) => o.outcome === "rejected_permanent")
  if (rejected.length === 0) return false
  const bouncedOutbox = new Set(rejected.map((o) => o.outboxId).filter((id): id is string => !!id))
  const bouncedRef = new Set(rejected.map((o) => o.messageRef).filter((ref): ref is string => !!ref))
  const proofBefore = now.getTime() - ACCEPTANCE_PROOF_HOURS * 60 * 60 * 1000
  return outcomes
    .filter((o) => o.outcome === "accepted_by_relay")
    .every((o) => (o.outboxId && bouncedOutbox.has(o.outboxId)) || (o.messageRef && bouncedRef.has(o.messageRef)) || o.createdAt.getTime() > proofBefore)
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
  neverReached: boolean
}

export function addressAlertSubject(members: { name: string }[]): string {
  return members.length === 1
    ? `À joindre avant son créneau : ${members[0].name}`
    : `${members.length} bénévoles à joindre avant leur créneau`
}
