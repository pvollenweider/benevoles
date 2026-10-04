// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describeChanges, describeEntry } from "@/lib/event-log-narrative"
import type { ShiftLabel } from "@/lib/event-log-read"
import { ENTITY_LABELS, entityBadgeClass, entryCountByEntity, fmtDateTime, isBaseline, type ExplorerEntry as EventLogEntry } from "@/lib/event-log-explorer"
import { EmptyTabPrompt } from "./Pickers"

export default function ExploreList({
  entries, shiftLabels, loading, error, nextCursor, onLoadMore, onReplay, onStory,
}: {
  entries: EventLogEntry[]
  shiftLabels: Record<string, ShiftLabel>
  loading: boolean
  error: string | null
  nextCursor: string | null
  onLoadMore: () => void
  onReplay: (e: EventLogEntry) => void
  onStory: (e: EventLogEntry) => void
}) {
  if (error) return <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
  if (loading && entries.length === 0) return <p role="status" className="text-sm text-gray-500">Chargement…</p>
  if (entries.length === 0) return <EmptyTabPrompt text="Aucune entrée pour ces filtres." />

  const entryCountByEntityId = entryCountByEntity(entries)

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const baseline = isBaseline(entry.action)
        return (
        <div key={entry.id} className={`border rounded-xl p-4 ${baseline ? "bg-gray-50 border-gray-100" : "bg-white border-gray-200"}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${baseline ? "bg-gray-100 text-gray-700" : entityBadgeClass(entry.entityType)}`}>
                  {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                </span>
                {baseline && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    Généré, pas une action réelle
                  </span>
                )}
                <span className="text-xs text-gray-600">{fmtDateTime(entry.createdAt)}</span>
              </div>
              <p className={`text-sm ${baseline ? "text-gray-500 italic" : "text-gray-800"}`}>{describeEntry(entry, shiftLabels)}</p>
              {entry.changes && (
                <ul className="mt-1.5 space-y-0.5">
                  {describeChanges(entry.changes, shiftLabels).map((line) => (
                    <li key={line} className="text-xs text-gray-500 tabular-nums">{line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {(entryCountByEntityId.get(entry.entityId) ?? 0) > 1 && (
                <button onClick={() => onReplay(entry)} className="text-xs border border-gray-200 px-2.5 py-1 rounded-full hover:bg-gray-50 transition-colors">
                  Rejouer
                </button>
              )}
              <button onClick={() => onStory(entry)} className="text-xs border border-gray-200 px-2.5 py-1 rounded-full hover:bg-gray-50 transition-colors">
                Voir le récit
              </button>
            </div>
          </div>
        </div>
        )
      })}
      {nextCursor && (
        <button onClick={onLoadMore} disabled={loading} className="w-full text-sm text-blue-600 py-2 hover:underline disabled:opacity-50">
          {loading ? "Chargement…" : "Charger plus"}
        </button>
      )}
    </div>
  )
}
