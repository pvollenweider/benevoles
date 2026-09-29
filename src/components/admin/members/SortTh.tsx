// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { SortCol, SortDir } from "@/lib/members-list"

export default function SortTh({
  col, label, sortCol, sortDir, onSort,
}: {
  col: SortCol
  label: string
  sortCol: SortCol | null
  sortDir: SortDir
  onSort: (col: SortCol) => void
}) {
  const active = sortCol === col
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
  const icon = active ? (sortDir === "asc" ? "↑" : "↓") : "↕"

  return (
    <th scope="col" aria-sort={ariaSort} className="text-left px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        className="flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
      >
        {label}
        <span aria-hidden="true" className={active ? "text-blue-600" : "text-gray-300"}>{icon}</span>
      </button>
    </th>
  )
}
