"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react"
import { narrateChain } from "@/lib/event-log-narrative"
import type { ExplorerEntry as EventLogEntry } from "@/lib/event-log-explorer"

export default function StoryView({ eventId, rootId, onClear }: { eventId: string; rootId: string; onClear: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    queueMicrotask(() => { setLoading(true) })
    fetch(`/api/admin/events/${eventId}/log?chainOf=${rootId}`)
      .then((r) => r.json())
      .then((data) => {
        const chain = data.entries.map((e: EventLogEntry) => ({ ...e, createdAt: new Date(e.createdAt) }))
        setText(narrateChain(chain, data.shiftLabels))
      })
      .finally(() => setLoading(false))
  }, [eventId, rootId])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Récit</p>
        <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-800">Changer d'entrée</button>
      </div>
      {/* One persistent element for both states, not an early-return swap: the loading→loaded
          transition is a text update inside this live region, not a DOM subtree replacement,
          so the finished narration actually gets announced instead of arriving silently. */}
      <p role="status" className="text-sm text-gray-800 leading-relaxed max-w-[70ch]">
        {loading ? "Chargement…" : (text || "Rien à raconter pour cette entrée.")}
      </p>
    </div>
  )
}
