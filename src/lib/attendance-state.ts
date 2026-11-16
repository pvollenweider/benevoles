// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The attendance state of a confirmed registration (#1141): expected, present or absent.
 * Pure, no Prisma: shared by the day-of board, the registrations list, the export and the server.
 *
 * `checkedInAt` stays the arrival mark of #399. `attendanceStatus` only carries "absent" in this
 * release: "left_early" is reserved for a later PR and refused by the routes here. The two
 * columns are mutually exclusive:
 *
 * - expected: checkedInAt null, attendanceStatus null;
 * - present: checkedInAt set, attendanceStatus null;
 * - absent: checkedInAt null, attendanceStatus "absent".
 *
 * The allowed transitions are the four reversible actions. Present and absent never go directly
 * from one to the other: undo first, so every action is reversible by one press and a stale
 * request cannot overwrite a state recorded meanwhile on another device.
 */

export type AttendanceState = "expected" | "present" | "absent"

export type AttendanceTransition = "check_in" | "undo_check_in" | "mark_absent" | "undo_absent"

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
}

/** The state a registration is in. `attendanceStatus` wins when it says "absent". */
export function attendanceStateOf({ checkedInAt, attendanceStatus }: AttendanceFacts): AttendanceState {
  if (attendanceStatus === "absent") return "absent"
  return checkedInAt ? "present" : "expected"
}

export type TransitionPlan = { from: AttendanceState; to: AttendanceState }

/** The starting and resulting state of each action (#1141). */
export const ATTENDANCE_TRANSITIONS: Record<AttendanceTransition, TransitionPlan> = {
  check_in: { from: "expected", to: "present" },
  undo_check_in: { from: "present", to: "expected" },
  mark_absent: { from: "expected", to: "absent" },
  undo_absent: { from: "absent", to: "expected" },
}

/** Whether the action may run from `state`: one of the four allowed transitions. */
export function canTransition(from: AttendanceState, transition: AttendanceTransition): boolean {
  return ATTENDANCE_TRANSITIONS[transition].from === from
}
