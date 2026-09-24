"use client"

import { useState, useEffect, useCallback, useId } from "react"

export type OrgLogEntry = {
  id: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
}

const ACTION_LABEL: Record<string, string> = {
  "member.created": "a créé un membre",
  "member.updated": "a modifié un membre",
  "member.deactivated": "a désactivé un membre",
  "adminuser.invited": "a invité un admin",
  "adminuser.removed": "a retiré un admin",
}

const ENTITY_FILTERS = [
  { value: "", label: "Tous les types" },
  { value: "Member", label: "Membres" },
  { value: "AdminUser", label: "Comptes admin" },
]

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

export default function ActivityLog() {
  const [entries, setEntries] = useState<OrgLogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [entityType, setEntityType] = useState("")
  const [announcement, setAnnouncement] = useState("")

  const filterId = useId()

  const fetchPage = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams()
    if (entityType) params.set("entityType", entityType)
    if (cursor) params.set("cursor", cursor)
    const res = await fetch(`/api/admin/settings/activity?${params}`)
    if (!res.ok) throw new Error("fetch failed")
    return res.json() as Promise<{ entries: OrgLogEntry[]; nextCursor: string | null }>
  }, [entityType])

  useEffect(() => {
    // Deferred a tick: calling setState synchronously as the very first thing an effect does
    // forces a same-commit re-render — see the identical pattern in EventLogExplorer.tsx.
    queueMicrotask(() => {
      setLoading(true)
      setError(null)
      setLoadMoreError(null)
      fetchPage()
        .then((d) => {
          setEntries(d.entries)
          setNextCursor(d.nextCursor)
          // Cleared first: two consecutive identical announcements otherwise leave the live
          // region's text node untouched and most screen readers stay silent — see the same
          // technique in EventLogExplorer.tsx.
          setAnnouncement("")
          requestAnimationFrame(() => {
            setAnnouncement(`${d.entries.length} entrée${d.entries.length > 1 ? "s" : ""} trouvée${d.entries.length > 1 ? "s" : ""}.`)
          })
        })
        .catch(() => {
          setError("Impossible de charger le journal d'activité.")
          setAnnouncement("")
          requestAnimationFrame(() => { setAnnouncement("Impossible de charger le journal d'activité.") })
        })
        .finally(() => setLoading(false))
    })
  }, [fetchPage])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const d = await fetchPage(nextCursor)
      setEntries((prev) => [...prev, ...d.entries])
      setNextCursor(d.nextCursor)
      setAnnouncement("")
      requestAnimationFrame(() => {
        setAnnouncement(`${d.entries.length} entrée${d.entries.length > 1 ? "s" : ""} supplémentaire${d.entries.length > 1 ? "s" : ""} chargée${d.entries.length > 1 ? "s" : ""}.`)
      })
    } catch {
      setLoadMoreError("Impossible de charger la suite du journal.")
      setAnnouncement("")
      requestAnimationFrame(() => { setAnnouncement("Impossible de charger la suite du journal.") })
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div>
        <label htmlFor={filterId} className="block text-xs font-medium text-gray-500 mb-1">Filtrer par type</label>
        <select
          id={filterId}
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
        >
          {ENTITY_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {/* Initial load: loading/error/empty are mutually exclusive with the list because there's
          nothing to preserve yet. Once entries exist, they stay on screen regardless of a later
          "Charger plus" failure — see loadMoreError below, rendered alongside the list, not
          instead of it. */}
      {loading && entries.length === 0 ? (
        <p role="status" className="text-sm text-gray-500">Chargement…</p>
      ) : error && entries.length === 0 ? (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune activité pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-1.5" role="list">
          {entries.map((entry) => (
            <li key={entry.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-800 min-w-0">
                <span className="font-medium">{entry.actorLabel}</span> {ACTION_LABEL[entry.action] ?? entry.action}
              </p>
              <span className="text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">{fmtDateTime(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {loadMoreError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadMoreError}</p>
      )}

      {nextCursor && !loading && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
        >
          {loadingMore ? "Chargement…" : "Charger plus"}
        </button>
      )}
    </div>
  )
}
