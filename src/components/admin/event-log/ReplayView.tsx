"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { describeChanges, describeEntry } from "@/lib/event-log-narrative"
import type { ShiftLabel } from "@/lib/event-log-read"
import { ENTITY_LABELS, fmtDateTime, isBaseline, type ExplorerEntry as EventLogEntry } from "@/lib/event-log-explorer"
import { EmptyTabPrompt } from "./Pickers"

export default function ReplayView({
  eventId, scope, onClear,
}: {
  eventId: string
  scope: { entityType: string; entityId: string }
  onClear: () => void
}) {
  const [entries, setEntries] = useState<EventLogEntry[]>([])
  const [shiftLabels, setShiftLabels] = useState<Record<string, ShiftLabel>>({})
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [announcement, setAnnouncement] = useState("")
  const sliderRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    queueMicrotask(() => { setLoading(true) })
    const params = new URLSearchParams({ entityType: scope.entityType, entityId: scope.entityId, limit: "200" })
    fetch(`/api/admin/events/${eventId}/log?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const ordered = [...data.entries].reverse() // API returns newest-first; replay goes chronologically
        setEntries(ordered)
        setShiftLabels(data.shiftLabels)
        setStep(0)
      })
      .finally(() => setLoading(false))
  }, [eventId, scope])

  // Debounced: the range input's own aria-valuetext already announces "Étape X sur Y" on every
  // step, natively and instantly. This live region only adds the entry's content (what changed),
  // and only after the user pauses — during rapid arrow-key stepping it would otherwise queue
  // one full announcement per step on top of the native one.
  useEffect(() => {
    if (entries.length === 0) return
    const entry = entries[step]
    const id = setTimeout(() => {
      setAnnouncement([describeEntry(entry, shiftLabels), ...describeChanges(entry.changes, shiftLabels)].join(". ") + ".")
    }, 400)
    return () => clearTimeout(id)
  }, [step, entries, shiftLabels])

  if (loading) return <p role="status" className="text-sm text-gray-500">Chargement…</p>
  if (entries.length === 0) return <EmptyTabPrompt text="Aucun historique pour cet élément." />

  const entry = entries[step]

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Historique de {ENTITY_LABELS[scope.entityType]?.toLowerCase() ?? scope.entityType} · {entries.length} étape{entries.length > 1 ? "s" : ""}
        </p>
        <button onClick={onClear} className="text-xs text-gray-500 hover:text-gray-800">Changer d'élément</button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 min-h-[88px]">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs text-gray-600">{fmtDateTime(entry.createdAt)}</p>
          {isBaseline(entry.action) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              Généré, pas une action réelle
            </span>
          )}
        </div>
        <p className={`text-sm font-medium ${isBaseline(entry.action) ? "text-gray-500 italic" : "text-gray-900"}`}>{describeEntry(entry, shiftLabels)}</p>
        {entry.changes && (
          <ul className="mt-2 space-y-0.5">
            {describeChanges(entry.changes, shiftLabels).map((line) => (
              <li key={line} className="text-xs text-gray-600 tabular-nums">{line}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          aria-label="Étape précédente"
          className="border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
        >
          ‹
        </button>
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={Math.max(entries.length - 1, 0)}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          aria-label="Étape dans l'historique"
          aria-valuetext={`Étape ${step + 1} sur ${entries.length} : ${fmtDateTime(entry.createdAt)}`}
          className="flex-1 accent-blue-600"
        />
        <button
          onClick={() => setStep((s) => Math.min(entries.length - 1, s + 1))}
          disabled={step === entries.length - 1}
          aria-label="Étape suivante"
          className="border border-gray-200 rounded-full w-8 h-8 flex items-center justify-center hover:bg-gray-50 disabled:opacity-30 transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  )
}
