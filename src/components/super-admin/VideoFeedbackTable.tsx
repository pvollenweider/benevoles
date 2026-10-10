"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import Link from "next/link"
import SortTh from "@/components/admin/members/SortTh"
import { announce } from "@/lib/announce"
import { VIDEO_SORT_LABELS, usefulPercent, videoSortKey, type VideoSortCol } from "@/lib/super-admin-tables"
import { nextSort, sortAnnouncement, sortRows, urlWithSort, type SortState } from "@/lib/table-sort"
import type { FeedbackSummaryRow } from "@/lib/video-feedback"

/**
 * Oui / Non / total per video and revision (#646), sortable by any column (#820). Without a
 * sort, the page's order: catalogue order, newest revision first.
 */
export default function VideoFeedbackTable({ rows, initialSort }: { rows: FeedbackSummaryRow[]; initialSort: SortState<VideoSortCol> }) {
  const [sort, setSort] = useState(initialSort)
  const [sortStatus, setSortStatus] = useState("")
  const captionId = useId()
  const sorted = sortRows(rows, sort, videoSortKey)

  function toggleSort(col: VideoSortCol) {
    const next = nextSort(sort, col)
    setSort(next)
    window.history.replaceState(null, "", urlWithSort(window.location.href, next))
    announce(setSortStatus, sortAnnouncement(next, VIDEO_SORT_LABELS))
  }

  const th = { sortCol: sort.col, sortDir: sort.dir, onSort: toggleSort }
  return (
    <>
      <p role="status" className="sr-only">{sortStatus}</p>
      {/* Focusable region so a keyboard user can scroll the table sideways on a narrow screen. */}
      <div tabIndex={0} role="region" aria-labelledby={captionId} className="bg-white border border-gray-200 rounded-2xl overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <table className="w-full text-sm">
          <caption id={captionId} className="sr-only">Réponses par vidéo et par révision, triables par colonne</caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <SortTh col="video" label="Vidéo" {...th} />
              <SortTh col="revision" label="Révision" {...th} />
              <SortTh col="oui" label="Oui" align="right" {...th} />
              <SortTh col="non" label="Non" align="right" {...th} />
              <SortTh col="total" label="Total" align="right" {...th} />
              <SortTh col="utile" label="% utile" align="right" {...th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((r) => {
              const percent = usefulPercent(r)
              return (
                <tr key={`${r.videoId}#${r.revision}`}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    {r.title ? (
                      <Link href={`/videos/${r.videoId}`} className="text-blue-600 underline hover:text-blue-700">{r.title}</Link>
                    ) : (
                      <span className="text-gray-900">Vidéo retirée du catalogue</span>
                    )}
                    <span className="block text-xs text-gray-600 font-mono break-all">{r.videoId}</span>
                  </th>
                  <td className="px-4 py-2 text-gray-800 whitespace-nowrap">
                    {r.revision}
                    <span className="block text-xs text-gray-600">{r.current ? "actuelle" : "ancienne"}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{r.yes}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{r.no}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{r.total}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">
                    {percent === null ? <><span aria-hidden="true">—</span><span className="sr-only">aucune réponse</span></> : `${percent} %`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
