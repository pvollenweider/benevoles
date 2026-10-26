// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sector leaders of a deleted poste (#1010). A poste has no table: it is the roleName of an
 * event's shifts. Deleting a poste cancels its shifts, which keep their name, and keeps its
 * leaders. A poste is « deleted » when it has shifts and every one is cancelled (deleted as a
 * poste, or shift by shift): its leaders stay until removed by hand, are shown as such in
 * « Responsables de secteur », and are not carried into a duplicated event. A poste typed for a
 * leader before any shift exists is not deleted: its leaders keep following a duplication.
 */

/** Distinct roleNames of the live shifts (any status but « cancelled »), sorted for display. */
export function livePosteNames(shifts: { roleName: string; status: string }[]): string[] {
  return [...new Set(shifts.filter((s) => s.status !== "cancelled").map((s) => s.roleName))].sort((a, b) => a.localeCompare(b))
}

/** The postes whose every shift is cancelled, sorted. */
export function deletedPosteNames(shifts: { roleName: string; status: string }[]): string[] {
  const live = new Set(livePosteNames(shifts))
  return [...new Set(shifts.map((s) => s.roleName))].filter((r) => !live.has(r)).sort((a, b) => a.localeCompare(b))
}

/** The leaders whose poste is not one of `deleted`, in their order. A sector leader (#1169, no poste) is kept. */
export function leadersOutsideDeletedPostes<T extends { roleName: string | null }>(leaders: T[], deleted: Iterable<string>): T[] {
  const gone = new Set(deleted)
  return leaders.filter((l) => !l.roleName || !gone.has(l.roleName))
}

/**
 * The leaders a copy of the event takes (#1010, #1169): not those of a deleted poste, nor those of
 * an archived sector (a copy has only the active sectors). `leftOutSectors` counts the latter.
 */
export function leadersForCopy<T extends { roleName: string | null; sectorId?: string | null }>(
  leaders: T[], deleted: Iterable<string>, activeSectorIds: Iterable<string>,
): { taken: T[]; leftOutSectors: number } {
  const active = new Set(activeSectorIds)
  const kept = leadersOutsideDeletedPostes(leaders, deleted)
  const taken = kept.filter((l) => !l.sectorId || active.has(l.sectorId))
  return { taken, leftOutSectors: kept.length - taken.length }
}
