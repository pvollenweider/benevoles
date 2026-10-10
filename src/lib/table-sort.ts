// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sortable tables of the super admin (#820): organisations and video feedback. Same behaviour as
 * the members list (`SortTh`, src/lib/members-list.ts): a column header is a button, a click sorts
 * ascending, then descending, then back to the page's own order; the new order is announced. The
 * chosen sort lives in the URL (`?tri=<colonne>-<asc|desc>`), so it survives a reload.
 * Pure functions, safe to import from client components.
 */

export type SortDir = "asc" | "desc"
export type SortState<C extends string> = { col: C | null; dir: SortDir }

/** A cell's sort key: a number, a text (French collation), an ISO date string, or nothing. */
export type SortValue = number | string | null

/** Clicking a column: ascending, then descending, then back to no sort. */
export function nextSort<C extends string>(current: SortState<C>, col: C): SortState<C> {
  if (current.col !== col) return { col, dir: "asc" }
  return current.dir === "asc" ? { col, dir: "desc" } : { col: null, dir: "asc" }
}

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true })

/**
 * Compares two sort keys, ascending. Texts in French collation (accents and case aside, numbers
 * in their order: « Vidéo 2 » before « Vidéo 10 »). An empty value always comes last, in either
 * direction: it is the absence of a value, not a small one.
 */
function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  return collator.compare(String(a), String(b))
}

/**
 * Rows sorted by a column, or unchanged without a sort. Stable: rows with the same value keep the
 * page's own order. Empty values (null) last, whatever the direction.
 */
export function sortRows<R, C extends string>(rows: R[], { col, dir }: SortState<C>, key: (row: R, col: C) => SortValue): R[] {
  if (!col) return rows
  return rows
    .map((row, index) => ({ row, index, value: key(row, col) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index
        return a.value === null ? 1 : -1
      }
      const cmp = compareValues(a.value, b.value)
      return (dir === "asc" ? cmp : -cmp) || a.index - b.index
    })
    .map((x) => x.row)
}

/** The `?tri=` value of a sort, or null for the page's own order. */
export function sortParam<C extends string>({ col, dir }: SortState<C>): string | null {
  return col ? `${col}-${dir}` : null
}

/** The sort a `?tri=` value asks for; anything unknown is the page's own order. */
export function parseSortParam<C extends string>(value: string | string[] | undefined | null, cols: readonly C[]): SortState<C> {
  const v = Array.isArray(value) ? value[0] : value
  const match = v?.match(/^(.+)-(asc|desc)$/)
  if (!match || !(cols as readonly string[]).includes(match[1])) return { col: null, dir: "asc" }
  return { col: match[1] as C, dir: match[2] as SortDir }
}

/**
 * A column's name in the announcement, with its own words for each direction when « croissant »
 * doesn't say which end comes first (a date, a state).
 */
export type SortLabel = string | { name: string; asc: string; desc: string }

/** Live region text after a sort change. */
export function sortAnnouncement<C extends string>({ col, dir }: SortState<C>, labels: Record<C, SortLabel>): string {
  if (!col) return "Tri réinitialisé : ordre d'origine"
  const label = labels[col]
  if (typeof label === "string") return `Trié par ${label}, ${dir === "asc" ? "croissant" : "décroissant"}`
  return `Trié par ${label.name}, ${label[dir]}`
}

/** The current URL with its `?tri=` replaced, for `history.replaceState`. */
export function urlWithSort<C extends string>(href: string, state: SortState<C>): string {
  const url = new URL(href)
  const param = sortParam(state)
  if (param) url.searchParams.set("tri", param)
  else url.searchParams.delete("tri")
  return `${url.pathname}${url.search}${url.hash}`
}
