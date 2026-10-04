// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Post-event summary (#557), a section of the "Rapports" page: what an association needs to look
 * back on an event and prepare the next one — distinct volunteers, first-time vs returning, how
 * much of the check-in was used, planned vs attested hours, and the fill rate overall and per
 * role, every rate with its numerator and denominator spelled out. Pure: built on volunteer-hours.ts
 * (the same counting rules as the certificate, #556) and staffing.ts (reused rather than
 * re-derived, #394) — no Prisma import.
 */
import { staffingSummary, type StaffingShift, type StaffingSummary } from "./staffing"
import { splitMinutes, volunteerHourEntries, type HourRegistration } from "./volunteer-hours"

export type EventSummaryRegistration = HourRegistration & { volunteerId: string }

export type RoleFill = { roleName: string; filled: number; capacity: number }

export type EventSummary = {
  distinctVolunteers: number
  firstTimeCount: number
  returningCount: number
  shiftsConfirmed: number
  shiftsWithPresence: number
  shiftsWithoutPresence: number
  /** "none": no presence recorded at all; "full": every confirmed shift has one; "partial": some do. */
  checkInUsage: "none" | "partial" | "full"
  /** Every counted minute, attested or not (owner decision, #557) — the total the event was given. */
  plannedMinutes: number
  /** The recorded-presence subset of plannedMinutes: attestedMinutes <= plannedMinutes, always. */
  attestedMinutes: number
  fillOverall: { filled: number; capacity: number }
  fillByRole: RoleFill[]
  underfilled: StaffingSummary["underfilled"]
}

function byRoleFill(shifts: StaffingShift[]): RoleFill[] {
  const roles = [...new Set(shifts.map((s) => s.roleName))]
  return roles.map((roleName) => {
    const own = shifts.filter((s) => s.roleName === roleName)
    return { roleName, filled: own.reduce((n, s) => n + s.active, 0), capacity: own.reduce((n, s) => n + s.capacity, 0) }
  })
}

export function eventSummary(
  registrations: EventSummaryRegistration[],
  returningVolunteerIds: Set<string>,
  shifts: StaffingShift[],
  leaderRoles: string[],
  timeZone: string,
): EventSummary {
  const entries = volunteerHourEntries(registrations, timeZone)
  const volunteerIds = new Set(entries.map((e) => e.volunteerId!))
  const returningCount = [...volunteerIds].filter((id) => returningVolunteerIds.has(id)).length
  const withPresence = entries.filter((e) => e.attested).length
  const { plannedMinutes, attestedMinutes } = splitMinutes(entries)
  const staffing = staffingSummary(shifts, leaderRoles)

  return {
    distinctVolunteers: volunteerIds.size,
    firstTimeCount: volunteerIds.size - returningCount,
    returningCount,
    shiftsConfirmed: entries.length,
    shiftsWithPresence: withPresence,
    shiftsWithoutPresence: entries.length - withPresence,
    checkInUsage: entries.length === 0 || withPresence === 0 ? "none" : withPresence === entries.length ? "full" : "partial",
    plannedMinutes,
    attestedMinutes,
    fillOverall: { filled: staffing.totals.active, capacity: staffing.totals.capacity },
    fillByRole: byRoleFill(shifts),
    underfilled: staffing.underfilled,
  }
}
