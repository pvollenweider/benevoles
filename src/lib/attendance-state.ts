// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The attendance state of a confirmed registration (#1141): expected, present, absent or
 * left before the end. Pure, no Prisma: shared by the day-of board, the registrations list, the
 * export, the hours rules and the server.
 *
 * `checkedInAt` stays the arrival mark of #399. `attendanceStatus` carries "absent" or
 * "left_early". A row that left before the end keeps its `checkedInAt` (the arrival stays known),
 * `attendanceAt` says when the departure was recorded and `attendanceBy` who recorded it. No
 * departure time or duration is stored: a left-early participation is a recorded participation
 * whose duration is unknown, never computed from the arrival or the shift's times. What this
 * release writes:
 *
 * - expected: checkedInAt null, attendanceStatus null;
 * - present: checkedInAt set, attendanceStatus null;
 * - absent: checkedInAt null, attendanceStatus "absent";
 * - left_early: checkedInAt set, attendanceStatus "left_early".
 *
 * `checkedInAt` wins over a stray status when it says present, except for "left_early" which is
 * the one status that changes what an arrival means here. During a rolling deployment the previous
 * release still runs for a short time. Its check-in knows only `checkedInAt`: on a row this
 * release marked absent, it sets `checkedInAt` and leaves `attendanceStatus = "absent"`. Such a
 * row is present (someone recorded an arrival after the absence), here and for every reader of
 * `checkedInAt` alone (hours, certificates, the « Présent » column), so all of them agree. It
 * repairs itself: « Annuler la présence » accepts it and writes the four columns back to null.
 * The previous release also knows a `left_early` row as present (its `attendanceStateOf` lets
 * `checkedInAt` win) and its « Annuler la présence » clears the four columns: a departure undone
 * through that old screen is simply a presence undone there, which this release reads as expected.
 * No extra mechanism is needed for that.
 *
 * The allowed transitions are the six reversible actions. Present and absent never go directly
 * from one to the other, and nothing leads to or from left_early except its own two actions: to
 * mark a left-early person absent or expected, undo the departure first, then the presence. So
 * every action is reversible by one press and a stale request cannot overwrite a state recorded
 * meanwhile on another device.
 */

export type AttendanceState = "expected" | "present" | "absent" | "left_early"

export type AttendanceTransition =
  | "check_in"
  | "undo_check_in"
  | "mark_absent"
  | "undo_absent"
  | "mark_left_early"
  | "undo_left_early"

/** What a row shows, without the database's extra columns. */
export type AttendanceFacts = {
  checkedInAt?: Date | string | null
  attendanceStatus?: string | null
}

/** The French labels shown in badges, counts and the export. */
export const ATTENDANCE_LABELS: Record<AttendanceState, string> = {
  expected: "Attendu",
  present: "Présent",
  absent: "Absent",
  left_early: "Parti avant la fin",
}

/**
 * The state a registration is in. An arrival means present, unless the status says the person
 * left before the end (the arrival is then still known). Without an arrival, only "absent" is a
 * recorded state; a stray "left_early" with no arrival cannot be written by this code and reads
 * as expected.
 */
export function attendanceStateOf({ checkedInAt, attendanceStatus }: AttendanceFacts): AttendanceState {
  if (checkedInAt) return attendanceStatus === "left_early" ? "left_early" : "present"
  return attendanceStatus === "absent" ? "absent" : "expected"
}

export type TransitionPlan = { from: AttendanceState; to: AttendanceState }

/** The starting and resulting state of each action (#1141). */
export const ATTENDANCE_TRANSITIONS: Record<AttendanceTransition, TransitionPlan> = {
  check_in: { from: "expected", to: "present" },
  undo_check_in: { from: "present", to: "expected" },
  mark_absent: { from: "expected", to: "absent" },
  undo_absent: { from: "absent", to: "expected" },
  mark_left_early: { from: "present", to: "left_early" },
  undo_left_early: { from: "left_early", to: "present" },
}

/** Whether the action may run from `state`: one of the six allowed transitions. */
export function canTransition(from: AttendanceState, transition: AttendanceTransition): boolean {
  return ATTENDANCE_TRANSITIONS[transition].from === from
}
