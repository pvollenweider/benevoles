// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Milestone form logic shared by creation and edition (#989): the same checks and messages for
 * both, the date input value of a stored due date, and the list order; the owner (#985), and when
 * a milestone is overdue or its owner due for a reminder. No Prisma here: the module is imported
 * by the client component MilestonesSection.
 */

/** `ownerId`: an admin account id, `null` (or "" from the form) for none, absent when not sent. */
export type MilestoneInput = { title: string; dueDate: string; ownerId?: string | null }

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
  const value: MilestoneInput = { title, dueDate: input.dueDate }
  if (input.ownerId !== undefined) value.ownerId = input.ownerId || null
  return { ok: true, value }
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
export function milestoneChanges(before: { title: string; dueDate: string; ownerId?: string | null }, value: MilestoneInput): Partial<MilestoneInput> {
  const changes: Partial<MilestoneInput> = {}
  if (value.title !== before.title) changes.title = value.title
  if (value.dueDate !== dueDateInputValue(before.dueDate)) changes.dueDate = value.dueDate
  if (value.ownerId !== undefined && value.ownerId !== (before.ownerId ?? null)) changes.ownerId = value.ownerId
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

// ── Owner (#985) ──────────────────────────────────────────────────────────────────────────────

/**
 * Who can be in charge of a milestone: an active admin account (owner or organiser) of the
 * event's organisation. Not the sector leaders: they have no account, only a personal link to
 * their own role's roster, and never see the milestones. The API reads the candidate with this
 * filter and checks the row again with `isEligibleMilestoneOwner`, so an id of another
 * organisation, a deactivated or a pending account is refused even if the read were not scoped.
 */
export function eligibleOwnerWhere(organizationId: string) {
  return { organizationId, isActive: true }
}

export function isEligibleMilestoneOwner(
  candidate: { organizationId: string | null; isActive: boolean } | null | undefined,
  organizationId: string,
): boolean {
  return !!candidate && candidate.isActive && candidate.organizationId === organizationId
}

/** Answer of the API (422) to an owner that is not, or no longer, an active admin of the organisation. */
export const MILESTONE_OWNER_UNAVAILABLE = "Choisissez qui s'en occupe parmi les membres actifs de l'équipe."

export type OwnerOption = { id: string; name: string; inactive?: boolean }

/**
 * The « Responsable » choices: the team by name, then the milestone's current owner if it is no
 * longer in the team (deactivated account), so editing the milestone does not silently drop it.
 */
export function ownerOptions(team: { id: string; name: string }[], current?: { id: string; name: string } | null): OwnerOption[] {
  const options: OwnerOption[] = [...team]
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }))
    .map(({ id, name }) => ({ id, name }))
  if (current && !options.some((o) => o.id === current.id)) options.push({ id: current.id, name: current.name, inactive: true })
  return options
}

export function ownerOptionLabel(option: OwnerOption): string {
  return option.inactive ? `${option.name} (compte désactivé)` : option.name
}

// ── Due day (#985) ────────────────────────────────────────────────────────────────────────────

/** The due day "YYYY-MM-DD": stored at midnight UTC of the picked day (see dueDateInputValue). */
function dueDayOf(dueDate: Date | string): string {
  return dueDateInputValue(typeof dueDate === "string" ? dueDate : dueDate.toISOString())
}

/** Today "YYYY-MM-DD" in the organisation's time zone. */
function todayIn(now: Date, timeZone: string): string {
  return now.toLocaleDateString("sv-SE", { timeZone })
}

/** Whole days from today (in `timeZone`) to the due day: 0 on the day, negative once past. */
export function daysUntilDue(dueDate: Date | string, now: Date, timeZone: string): number {
  return Math.round((Date.parse(`${dueDayOf(dueDate)}T00:00:00Z`) - Date.parse(`${todayIn(now, timeZone)}T00:00:00Z`)) / 86_400_000)
}

/**
 * Overdue: not done, and its due day is over in the organisation's time zone. The same rule on
 * the event page and the dashboard: a milestone due today is not late yet.
 */
export function isMilestoneOverdue(milestone: { dueDate: Date | string; done: boolean }, now: Date, timeZone: string): boolean {
  return !milestone.done && daysUntilDue(milestone.dueDate, now, timeZone) < 0
}

/** The owner is emailed once, from this many days before the due day until the day itself. */
export const MILESTONE_REMINDER_DAYS = 3

/** Whether the owner's reminder should go now: not done, an owner, not yet reminded, in the window. */
export function milestoneReminderDue(
  milestone: { dueDate: Date | string; done: boolean; ownerId: string | null; ownerRemindedAt: Date | null },
  now: Date,
  timeZone: string,
): boolean {
  if (milestone.done || !milestone.ownerId || milestone.ownerRemindedAt) return false
  const days = daysUntilDue(milestone.dueDate, now, timeZone)
  return days >= 0 && days <= MILESTONE_REMINDER_DAYS
}
