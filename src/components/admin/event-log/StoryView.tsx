"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useState } from "react"
import { narrateChain } from "@/lib/event-log-narrative"
import { STORY_LOAD_ERROR, type ExplorerEntry as EventLogEntry } from "@/lib/event-log-explorer"

export default function StoryView({ eventId, rootId, onClear }: { eventId: string; rootId: string; onClear: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    queueMicrotask(() => { setLoading(true); setFailed(false) })
    // A refused or failed request says so (#1272), never « Rien à raconter » as if the chain were empty.
    fetch(`/api/admin/events/${eventId}/log?chainOf=${rootId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`log ${r.status}`)
        return r.json()
      })
      .then((data) => {
        const chain = data.entries.map((e: EventLogEntry) => ({ ...e, createdAt: new Date(e.createdAt) }))
        setText(narrateChain(chain, data.shiftLabels, data.timeZone))
      })
      .catch(() => { setText(null); setFailed(true) })
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
      <p role="status" className={`text-sm leading-relaxed max-w-[70ch] ${failed && !loading ? "text-red-700" : "text-gray-800"}`}>
        {loading ? "Chargement…" : failed ? STORY_LOAD_ERROR : (text || "Rien à raconter pour cette entrée.")}
      </p>
    </div>
  )
}
