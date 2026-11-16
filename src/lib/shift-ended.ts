// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftInstants } from "./ics"

/**
 * A shift that is over can't be taken from the public sign-up any more, whatever the length of the
 * event: its end, in the organisation's time zone (a night shift ends the next day, the hour change
 * days count their real length), is at or before `now`. A shift that has started and is still
 * running can be taken, like a draft assignment published for it (only an ended one is refused).
 * Pure: shared by the public page (the shift shows « Terminé ») and the sign-up route.
 */

type TimedShift = { date: Date | string; startTime: string; endTime: string }

export function shiftHasEnded(shift: TimedShift, now: Date, timeZone: string): boolean {
  return shiftInstants(shift, timeZone).end.getTime() <= now.getTime()
}

/** The first of these shifts that is over, or null. */
export function endedShift<S extends TimedShift>(shifts: S[], now: Date, timeZone: string): S | null {
  return shifts.find((s) => shiftHasEnded(s, now, timeZone)) ?? null
}
