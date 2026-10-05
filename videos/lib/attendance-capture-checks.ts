// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

export type AttendanceSnapshot = { id: string; status: string; checkedInAt: Date | null }

/** Evidence for a real UI action: same registrations, unchanged status, only selected active rows updated. */
export function verifyAttendanceTransition(before: AttendanceSnapshot[], after: AttendanceSnapshot[], selectedIds: string[], present: boolean) {
  const selected = new Set(selectedIds)
  const next = new Map(after.map(row => [row.id, row]))
  if (next.size !== after.length || before.length !== after.length || new Set(before.map(r => r.id)).size !== before.length) throw new Error("Registration set changed during presence action")
  const changedIds = []
  for (const row of before) {
    const updated = next.get(row.id)
    if (!updated || updated.status !== row.status) throw new Error("Presence action changed an inscription or its status")
    const oldTime = row.checkedInAt?.getTime() ?? null
    const newTime = updated.checkedInAt?.getTime() ?? null
    const eligible = selected.has(row.id) && row.status === "active" && (present ? oldTime === null : oldTime !== null)
    if (eligible) {
      if (present ? newTime === null || !Number.isFinite(newTime) : newTime !== null) throw new Error("Selected presence was not applied")
      changedIds.push(row.id)
    } else if (oldTime !== newTime) throw new Error("Presence changed outside eligible selection")
  }
  if (selectedIds.some(id => !next.has(id))) throw new Error("Selection refers to missing registration")
  return changedIds.sort()
}
