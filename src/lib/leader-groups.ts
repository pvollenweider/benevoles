// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The « Responsables » screen of an event that adopted sectors (#1169), grouped by sector: each
 * active sector in its order (shown even without a leader, so the organiser sees where a sector
 * leader can go), with the leaders of its postes; an archived sector only while it still has
 * leaders; then the postes of no active sector (NO_SECTOR_LABEL, the caller's heading), only when
 * one has a leader. Pure, no Prisma import: the client component reads it.
 */

type Row = { roleName: string | null; sectorId?: string | null }
type SectorOption = { id: string; name: string; archived: boolean; postes: string[] }

export type LeaderSectorGroup<L> = {
  /** Null for the postes of no active sector. */
  sector: SectorOption | null
  /** The poste leaders of the group, by poste in the sector's order (alphabetical for the others). */
  postes: { roleName: string; leaders: L[] }[]
}

/** `sectors` lists the active sectors in their order, then the archived ones. */
export function leaderSectorGroups<L extends Row>(leaders: L[], sectors: SectorOption[]): LeaderSectorGroup<L>[] {
  const sectorOfPoste = new Map<string, string>()
  for (const s of sectors) if (!s.archived) for (const p of s.postes) sectorOfPoste.set(p, s.id)
  const posteLeaders = new Map<string, L[]>()
  for (const l of leaders) {
    if (l.sectorId || !l.roleName) continue
    const list = posteLeaders.get(l.roleName) ?? []
    list.push(l)
    posteLeaders.set(l.roleName, list)
  }
  const groups: LeaderSectorGroup<L>[] = []
  for (const s of sectors) {
    const hasOwn = leaders.some((l) => l.sectorId === s.id)
    if (s.archived && !hasOwn) continue
    const postes = s.archived ? [] : s.postes.filter((p) => posteLeaders.has(p)).map((p) => ({ roleName: p, leaders: posteLeaders.get(p)! }))
    groups.push({ sector: s, postes })
  }
  const others = [...posteLeaders.keys()].filter((p) => !sectorOfPoste.has(p)).sort((a, b) => a.localeCompare(b, "fr"))
  if (others.length > 0) groups.push({ sector: null, postes: others.map((p) => ({ roleName: p, leaders: posteLeaders.get(p)! })) })
  return groups
}
