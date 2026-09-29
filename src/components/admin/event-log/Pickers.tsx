"use client"

import { useEffect, useState } from "react"

export function EmptyTabPrompt({ text }: { text: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-sm text-gray-600 text-center">
      {text}
    </div>
  )
}

export interface ReplayCandidate { entityType: string; entityId: string; label: string; count: number }

/**
 * Lets "Rejouer" be used directly from its own tab: lists every entity with more than one log
 * entry (the only ones worth stepping through) instead of only being reachable via a row's
 * "Rejouer" button in Explorer.
 */
export function ReplayPicker({ eventId, onPick }: { eventId: string; onPick: (c: ReplayCandidate) => void }) {
  const [candidates, setCandidates] = useState<ReplayCandidate[] | null>(null)

  useEffect(() => {
    fetch(`/api/admin/events/${eventId}/log/candidates?kind=replay`)
      .then((r) => r.json())
      .then((data) => setCandidates(data.candidates))
      .catch(() => setCandidates([]))
  }, [eventId])

  if (candidates === null) return <p role="status" className="text-sm text-gray-500">Chargement…</p>
  if (candidates.length === 0) {
    return <EmptyTabPrompt text="Rien à rejouer pour l'instant : aucun créneau ni inscription n'a plusieurs entrées dans le journal." />
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Choisissez un élément à rejouer pas à pas :</p>
      {candidates.map((c) => (
        <button
          key={`${c.entityType}-${c.entityId}`}
          onClick={() => onPick(c)}
          className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/50 transition-colors flex items-center justify-between gap-3"
        >
          <span className="text-sm text-gray-800">{c.label}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{c.count} entrées</span>
        </button>
      ))}
    </div>
  )
}

interface StoryCandidate { logId: string; label: string; entryCount: number }

/** Same idea as ReplayPicker, for "Récit": lists actual causal chains (roots that caused at
 *  least one other entry) — a single isolated entry narrates, but isn't a story worth picking. */
export function StoryPicker({ eventId, onPick }: { eventId: string; onPick: (logId: string) => void }) {
  const [candidates, setCandidates] = useState<StoryCandidate[] | null>(null)

  useEffect(() => {
    fetch(`/api/admin/events/${eventId}/log/candidates?kind=story`)
      .then((r) => r.json())
      .then((data) => setCandidates(data.candidates))
      .catch(() => setCandidates([]))
  }, [eventId])

  if (candidates === null) return <p role="status" className="text-sm text-gray-500">Chargement…</p>
  if (candidates.length === 0) {
    return <EmptyTabPrompt text="Aucun enchaînement à raconter pour l'instant : le récit relie des actions qui en ont provoqué une autre (ex : une annulation qui libère une place)." />
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Choisissez un enchaînement à lire :</p>
      {candidates.map((c) => (
        <button
          key={c.logId}
          onClick={() => onPick(c.logId)}
          className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
        >
          <span className="text-sm text-gray-800">{c.label}</span>
        </button>
      ))}
    </div>
  )
}
