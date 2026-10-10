// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { SortDir } from "@/lib/table-sort"

/**
 * A sortable column header: a button in the `th`, `aria-sort` on the sorted column. Shared by the
 * members list and the super admin tables (#820).
 */
export default function SortTh<C extends string>({
  col, label, sortCol, sortDir, onSort, align = "left",
}: {
  col: C
  label: string
  sortCol: C | null
  sortDir: SortDir
  onSort: (col: C) => void
  /** A numbers column: header aligned with its figures, on the right. */
  align?: "left" | "right"
}) {
  const active = sortCol === col
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
  const icon = active ? (sortDir === "asc" ? "↑" : "↓") : "↕"

  return (
    <th scope="col" aria-sort={ariaSort} className={`${align === "right" ? "text-right" : "text-left"} px-4 py-2 font-medium`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded${align === "right" ? " ml-auto" : ""}`}
      >
        {label}
        <span aria-hidden="true" className={active ? "text-blue-600" : "text-gray-500"}>{icon}</span>
      </button>
    </th>
  )
}
