// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Grouping of reminder candidates by volunteer, event and local day (#672).
 *
 * Before this, the hourly cron sent one email (and one push) per registration and per window
 * (J-2, J-1, day-of): a volunteer with 3 shifts the same day got up to 9 emails for one day of
 * help. Consolidated per owner decision (2026-10-05): one email per volunteer, event, local day
 * and window, listing every active shift of that day that still needs this window's reminder.
 *
 * Pure: no Prisma, no Date.now(). The caller (the cron route) already restricted `candidates` to
 * active registrations of a published event with reminders enabled, a non-cancelled shift, and
 * this window's `reminder*Sent` field still null — so a group here only ever contains shifts that
 * still need this window's email. A shift already sent, or cancelled, is simply absent from the
 * next run's candidates and never blocks the rest of its day's group.
 */

import { localDateTimeToUtc } from "./time-zone"

export type GroupableShift = { date: Date; startTime: string }

export type GroupableRegistration = {
  volunteerId: string
  eventId: string
  shift: GroupableShift
}

export type ReminderGroup<T extends GroupableRegistration> = {
  volunteerId: string
  eventId: string
  /** The group's local calendar day, ISO ("YYYY-MM-DD"). */
  localDay: string
  /** Every registration of this volunteer/event/day still needing this window's reminder, sorted by shift start. */
  registrations: T[]
  /** Start instant of the earliest shift of the group: this is what a window's [lower, upper] bound is checked against. */
  earliestStart: Date
}

/**
 * The local calendar day a shift belongs to (#672): its stored `date`, which is already the
 * calendar day an admin set for it — including for a shift running past midnight (owner decision:
 * a night shift counts on its start day, consistent with the rest of the product).
 */
export function shiftLocalDay(shift: GroupableShift): string {
  return shift.date.toISOString().slice(0, 10)
}

/** Real start instant of a shift, in the given time zone (see shiftStartAt in the cron route). */
export function shiftStartInstant(shift: GroupableShift, timeZone: string): Date {
  return localDateTimeToUtc(shift.date, shift.startTime, timeZone)
}

const KEY_SEP = "\u0000"

/**
 * Groups candidates by (volunteerId, eventId, local day). `timeZoneOf` reads the organization's
 * time zone for a given candidate (shifts of different events of the same organization, or of
 * different organizations, still resolve their own zone correctly).
 */
export function groupRemindersByDay<T extends GroupableRegistration>(
  candidates: T[],
  timeZoneOf: (r: T) => string,
): ReminderGroup<T>[] {
  const buckets = new Map<string, T[]>()
  for (const r of candidates) {
    const key = [r.volunteerId, r.eventId, shiftLocalDay(r.shift)].join(KEY_SEP)
    const arr = buckets.get(key)
    if (arr) arr.push(r)
    else buckets.set(key, [r])
  }

  const groups: ReminderGroup<T>[] = []
  for (const [key, regs] of buckets) {
    const [volunteerId, eventId, localDay] = key.split(KEY_SEP)
    const sorted = [...regs].sort(
      (a, b) => shiftStartInstant(a.shift, timeZoneOf(a)).getTime() - shiftStartInstant(b.shift, timeZoneOf(b)).getTime(),
    )
    groups.push({
      volunteerId,
      eventId,
      localDay,
      registrations: sorted,
      earliestStart: shiftStartInstant(sorted[0].shift, timeZoneOf(sorted[0])),
    })
  }
  return groups
}

/**
 * Groups triggered by this window (#672): the ones whose *earliest* shift enters [lower, upper].
 * Later shifts of the same day are included in the same email even if their own instant would
 * enter the window a few hours later — the whole point of the consolidation.
 */
export function groupsInWindow<T extends GroupableRegistration>(
  groups: ReminderGroup<T>[],
  lower: Date,
  upper: Date,
): ReminderGroup<T>[] {
  return groups.filter((g) => g.earliestStart >= lower && g.earliestStart <= upper)
}

/**
 * The groups this window must send now (#672). Shifts whose own start is already before the
 * window (`lower`) can no longer receive this reminder (a late sign-up, as before #672) and are
 * left out BEFORE grouping: otherwise such a shift, being the earliest of its day, would keep its
 * group from ever entering the window and the later shifts of that day would lose their reminder.
 */
export function remindersDue<T extends GroupableRegistration>(
  candidates: T[],
  timeZoneOf: (r: T) => string,
  lower: Date,
  upper: Date,
): ReminderGroup<T>[] {
  const stillAhead = candidates.filter((r) => shiftStartInstant(r.shift, timeZoneOf(r)) >= lower)
  return groupsInWindow(groupRemindersByDay(stillAhead, timeZoneOf), lower, upper)
}
