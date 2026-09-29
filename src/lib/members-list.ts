// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the admin members page (MembersManager, #291): filtering, the three-state column
 * sort and its screen reader announcement, tag input parsing. Kept out of the component so it can
 * be tested on its own.
 */

export type MemberRow = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  tags: string[]
  active: boolean
  // Sum of every active registration's shift duration, across all of this org's events —
  // computed server-side (page.tsx). Admin-only recognition figure, deliberately not on the
  // volunteer-facing PDF export (see that computation's own comment for why).
  hoursTotal: number
}

export type Member = MemberRow & {
  id: string
  notes: string | null
}

export type SortCol = "firstName" | "lastName" | "hoursTotal"
export type SortDir = "asc" | "desc"
export type SortState = { col: SortCol | null; dir: SortDir }

/** Clicking a column: ascending, then descending, then back to no sort. */
export function nextSort(current: SortState, col: SortCol): SortState {
  if (current.col !== col) return { col, dir: "asc" }
  return current.dir === "asc" ? { col, dir: "desc" } : { col: null, dir: "asc" }
}

const COL_LABELS: Record<SortCol, string> = { firstName: "prénom", lastName: "nom", hoursTotal: "heures cumulées" }

/** Live region text after a sort change. */
export function sortAnnouncement({ col, dir }: SortState): string {
  if (!col) return "Tri réinitialisé"
  return `Trié par ${COL_LABELS[col]}, ${dir === "asc" ? "croissant" : "décroissant"}`
}

/** Members matching the search (name, email, phone), the tag and the inactive toggle. */
export function filterMembers<M extends MemberRow>(
  members: M[],
  { search, tag, showInactive }: { search: string; tag: string; showInactive: boolean },
): M[] {
  const q = search.trim().toLowerCase()
  return members.filter((m) => {
    if (!showInactive && !m.active) return false
    if (tag && !m.tags.includes(tag)) return false
    if (!q) return true
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q) ||
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
      (m.email ?? "").toLowerCase().includes(q) ||
      (m.phone ?? "").toLowerCase().includes(q)
    )
  })
}

/** Members sorted by a column (names in French collation), or unchanged without a sort. */
export function sortMembers<M extends MemberRow>(members: M[], { col, dir }: SortState): M[] {
  if (!col) return members
  return [...members].sort((a, b) => {
    const cmp = col === "hoursTotal"
      ? a.hoursTotal - b.hoursTotal
      : a[col].toLowerCase().localeCompare(b[col].toLowerCase(), "fr")
    return dir === "asc" ? cmp : -cmp
  })
}

/** "bénévole, bar, " → ["bénévole", "bar"]. */
export function parseTags(input: string): string[] {
  return input.split(",").map((t) => t.trim()).filter(Boolean)
}
