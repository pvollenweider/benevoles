// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sector leaders and the postes they lead (#1010). A poste has no table: it is the roleName of the
 * live shifts (any status but « cancelled ») of an event. Deleting a poste cancels its shifts and
 * keeps its leaders, so a leader row can point to a poste with no live shift: deleted, or every
 * shift cancelled one by one. Such leaders stay until removed by hand, are shown as such in
 * « Responsables de secteur », and are not carried into a duplicated event.
 */

/** The leaders whose poste is one of `postes`, in their order. */
export function leadersOfPostes<T extends { roleName: string }>(leaders: T[], postes: Iterable<string>): T[] {
  const live = new Set(postes)
  return leaders.filter((l) => live.has(l.roleName))
}

/** Distinct roleNames of the live shifts, sorted for display. */
export function livePosteNames(shifts: { roleName: string; status: string }[]): string[] {
  return [...new Set(shifts.filter((s) => s.status !== "cancelled").map((s) => s.roleName))].sort((a, b) => a.localeCompare(b))
}
