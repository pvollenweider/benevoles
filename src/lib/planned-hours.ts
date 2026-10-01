// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Heures planifiées » of a member (#571): the summed duration of the shifts they hold an active
 * registration on, across every event of the organisation. Planned time, not time spent: future
 * shifts and no-shows count. Durations are real elapsed time in the organisation's time zone
 * (same instants as the calendar export), so a shift across a daylight saving change counts one
 * hour more or less than its wall-clock span, and a shift past midnight ends the next day. Pure.
 */
import { shiftInstants } from "./ics"

export type PlannedRegistration = {
  status: string
  shift: { date: string | Date; startTime: string; endTime: string }
}

/** Planned hours of one member: active registrations only (no cancelled, waiting, offered or requested). */
export function plannedHours(registrations: PlannedRegistration[], timeZone: string): number {
  let ms = 0
  for (const r of registrations) {
    if (r.status !== "active") continue
    const { start, end } = shiftInstants(r.shift, timeZone)
    ms += end.getTime() - start.getTime()
  }
  return ms / 3_600_000
}
