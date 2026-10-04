// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fold } from "./text-fold"
import type { AddressStatusView } from "./address-status"

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
  // Past confirmed shifts only, real local instants, no presence recorded (#557) — computed
  // server-side (page.tsx, volunteer-hours.ts). Admin-only recognition figure, deliberately not on
  // the volunteer-facing PDF export (see that computation's own comment for why).
  hoursTotal: number
  // Past confirmed shifts with a recorded presence (#557), same scope as hoursTotal: the two never
  // overlap and add up to every hour the member actually gave, as far as check-in was used.
  hoursAttested: number
  // Local date ("YYYY-MM-DD") of the most recent past shift with an active registration, and of the
  // most recent recorded presence — null when there is none of either (#557).
  lastShiftDate: string | null
  lastPresenceDate: string | null
  // Whether the member's current address needs checking (#599), computed server-side (one extra
  // query for the whole list, delivery-outcomes-data.ts's loadAddressStatuses).
  addressStatus: AddressStatusView
}

export type Member = MemberRow & {
  id: string
  notes: string | null
  availabilityPeriods?: string[]
  availabilityNote?: string | null
}

export type SortCol = "firstName" | "lastName" | "hoursTotal" | "hoursAttested" | "lastShiftDate"
export type SortDir = "asc" | "desc"
export type SortState = { col: SortCol | null; dir: SortDir }

/** Clicking a column: ascending, then descending, then back to no sort. */
export function nextSort(current: SortState, col: SortCol): SortState {
  if (current.col !== col) return { col, dir: "asc" }
  return current.dir === "asc" ? { col, dir: "desc" } : { col: null, dir: "asc" }
}

const COL_LABELS: Record<SortCol, string> = {
  firstName: "prénom",
  lastName: "nom",
  hoursTotal: "heures planifiées",
  hoursAttested: "heures attestées",
  lastShiftDate: "dernière participation",
}

const NUMERIC_COLS = new Set<SortCol>(["hoursTotal", "hoursAttested"])
/** Null sorts first ascending (never participated), last descending — never silently mixed with a real date. */
const compareNullableDate = (a: string | null, b: string | null): number => {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a.localeCompare(b)
}

/** Live region text after a sort change. */
export function sortAnnouncement({ col, dir }: SortState): string {
  if (!col) return "Tri réinitialisé"
  return `Trié par ${COL_LABELS[col]}, ${dir === "asc" ? "croissant" : "décroissant"}`
}

/** Members matching the search (name, email, phone), the tag and the inactive toggle. */
export function filterMembers<M extends MemberRow>(
  members: M[],
  { search, tag, showInactive, addressToVerify = false }: { search: string; tag: string; showInactive: boolean; addressToVerify?: boolean },
): M[] {
  const q = fold(search.trim())
  return members.filter((m) => {
    if (!showInactive && !m.active) return false
    if (tag && !m.tags.includes(tag)) return false
    if (addressToVerify && m.addressStatus.kind !== "to_verify") return false
    if (!q) return true
    // Accents and case aside (#390): « zoe » finds Zoé.
    return (
      fold(m.firstName).includes(q) ||
      fold(m.lastName).includes(q) ||
      fold(`${m.firstName} ${m.lastName}`).includes(q) ||
      fold(m.email).includes(q) ||
      fold(m.phone).includes(q)
    )
  })
}

/** Members sorted by a column (names in French collation), or unchanged without a sort. */
export function sortMembers<M extends MemberRow>(members: M[], { col, dir }: SortState): M[] {
  if (!col) return members
  return [...members].sort((a, b) => {
    const cmp = NUMERIC_COLS.has(col)
      ? a[col as "hoursTotal" | "hoursAttested"] - b[col as "hoursTotal" | "hoursAttested"]
      : col === "lastShiftDate"
        ? compareNullableDate(a.lastShiftDate, b.lastShiftDate)
        : a[col as "firstName" | "lastName"].toLowerCase().localeCompare(b[col as "firstName" | "lastName"].toLowerCase(), "fr")
    return dir === "asc" ? cmp : -cmp
  })
}

/** How many members have an address to verify, whatever the other filters (#599): the honest
 * count for the filter's own label, computed once from the same list the page already has. */
export function addressesToVerifyCount<M extends MemberRow>(members: M[]): number {
  return members.filter((m) => m.addressStatus.kind === "to_verify").length
}

/** "bénévole, bar, " → ["bénévole", "bar"]. */
export function parseTags(input: string): string[] {
  return input.split(",").map((t) => t.trim()).filter(Boolean)
}
