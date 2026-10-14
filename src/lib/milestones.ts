// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Milestone form logic shared by creation and edition (#989): the same checks and messages for
 * both, the date input value of a stored due date, and the list order. No Prisma here: the module
 * is imported by the client component MilestonesSection.
 */

export type MilestoneInput = { title: string; dueDate: string }

export type MilestoneValidation =
  | { ok: true; value: MilestoneInput }
  | { ok: false; field: "title" | "dueDate"; message: string }

export const MILESTONE_TITLE_MAX = 140

/** Checks the form fields, in the order they are shown; the title is sent trimmed. */
export function validateMilestoneInput(input: MilestoneInput): MilestoneValidation {
  const title = input.title.trim()
  if (!title) return { ok: false, field: "title", message: "Indiquez le titre du jalon." }
  if (title.length > MILESTONE_TITLE_MAX) {
    return { ok: false, field: "title", message: `Le titre du jalon ne doit pas dépasser ${MILESTONE_TITLE_MAX} caractères.` }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`))) {
    return { ok: false, field: "dueDate", message: "Indiquez l'échéance." }
  }
  return { ok: true, value: { title, dueDate: input.dueDate } }
}

/**
 * The `<input type="date">` value of a stored due date. The API stores the picked day at midnight
 * UTC (`z.coerce.date()` on "YYYY-MM-DD"), so the UTC day is the one that was picked, whatever the
 * browser's time zone.
 */
export function dueDateInputValue(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10)
}

/** The body of the PATCH: only the fields that changed (an unchanged edit sends `{}`). */
export function milestoneChanges(before: { title: string; dueDate: string }, value: MilestoneInput): Partial<MilestoneInput> {
  const changes: Partial<MilestoneInput> = {}
  if (value.title !== before.title) changes.title = value.title
  if (value.dueDate !== dueDateInputValue(before.dueDate)) changes.dueDate = value.dueDate
  return changes
}

/** By due date, as the page loads them; equal dates keep their current order (stable sort). */
export function sortMilestones<T extends { dueDate: string }>(milestones: T[]): T[] {
  return [...milestones].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
}

/** Replaces the edited milestone and puts it back at its place by due date. */
export function replaceMilestone<T extends { id: string; dueDate: string }>(milestones: T[], updated: T): T[] {
  return sortMilestones(milestones.map((m) => (m.id === updated.id ? updated : m)))
}
