"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect, useCallback, useRef } from "react"
import type { ShiftLabel } from "@/lib/event-log-read"
import {
  baselineAnnouncement,
  loadedAnnouncement,
  logQueryParams,
  tabForKey,
  type ExplorerEntry as EventLogEntry,
  type Tab,
} from "@/lib/event-log-explorer"
import ExploreList from "./event-log/ExploreList"
import FilterBar from "./event-log/FilterBar"
import { ReplayPicker, StoryPicker } from "./event-log/Pickers"
import ReplayView from "./event-log/ReplayView"
import StoryView from "./event-log/StoryView"
import TabButton from "./event-log/TabButton"

export default function EventLogExplorer({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState<Tab>("explore")
  const [entries, setEntries] = useState<EventLogEntry[]>([])
  const [shiftLabels, setShiftLabels] = useState<Record<string, ShiftLabel>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")

  const [entityType, setEntityType] = useState("")
  const [actorType, setActorType] = useState("")
  const [action, setAction] = useState("")
  const [since, setSince] = useState("")
  const [until, setUntil] = useState("")

  // The entity scoped into "Rejouer" / "Récit" from a list row — Replay/Story stay reachable
  // tabs at all times (never disabled), each showing a prompt when nothing is scoped yet.
  const [replayEntity, setReplayEntity] = useState<{ entityType: string; entityId: string } | null>(null)
  const [storyRootId, setStoryRootId] = useState<string | null>(null)

  const [generatingBaseline, setGeneratingBaseline] = useState(false)
  // Once generated (this session or a previous one, via localStorage), the prompt disappears —
  // re-running it is harmless (the endpoint is idempotent) but pointless to keep offering. A
  // lazy initializer, not an effect: a plain synchronous read, nothing to defer.
  const [baselineDone, setBaselineDone] = useState(() => {
    try {
      return localStorage.getItem(`eventlog-baseline-done:${eventId}`) === "1"
    } catch {
      return false // private browsing / blocked storage: the button just stays offered every visit
    }
  })

  const explorePanelRef = useRef<HTMLDivElement>(null)
  const replayPanelRef = useRef<HTMLDivElement>(null)
  const storyPanelRef = useRef<HTMLDivElement>(null)

  const fetchEntries = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError(null)
    const params = logQueryParams({ entityType, actorType, action, since, until }, cursor)

    try {
      const res = await fetch(`/api/admin/events/${eventId}/log?${params}`)
      if (!res.ok) throw new Error("Erreur de chargement")
      const data = await res.json()
      setEntries((prev) => (cursor ? [...prev, ...data.entries] : data.entries))
      setShiftLabels((prev) => (cursor ? { ...prev, ...data.shiftLabels } : data.shiftLabels))
      setNextCursor(data.nextCursor)
      // Cleared first: if two consecutive fetches announce identical text (same count, twice
      // in a row), React won't touch the live region's text node and most screen readers stay
      // silent even though the visible list changed underneath. Clearing forces a real mutation.
      setAnnouncement("")
      requestAnimationFrame(() => {
        setAnnouncement(loadedAnnouncement(data.entries.length, Boolean(cursor)))
      })
    } catch {
      setError("Impossible de charger le journal. Réessayez.")
      setAnnouncement("")
      requestAnimationFrame(() => { setAnnouncement("Impossible de charger le journal. Réessayez.") })
    } finally {
      setLoading(false)
    }
  }, [eventId, entityType, actorType, action, since, until])

  useEffect(() => {
    // Deferred a tick: fetchEntries's first act is setLoading(true), and calling that
    // synchronously as the very first thing an effect does forces a same-commit re-render.
    queueMicrotask(() => { fetchEntries() })
  }, [fetchEntries])

  // Without this, switching tabs from a button inside the panel that just got `hidden` sends
  // focus to <body> (HTML's focus-fixup algorithm) — the keyboard/screen-reader user loses
  // their place every time they use "Rejouer"/"Voir le récit", the most common path here.
  useEffect(() => {
    const panel = tab === "explore" ? explorePanelRef.current : tab === "replay" ? replayPanelRef.current : storyPanelRef.current
    panel?.focus()
  }, [tab])

  function openReplay(entry: EventLogEntry) {
    setReplayEntity({ entityType: entry.entityType, entityId: entry.entityId })
    setTab("replay")
  }

  function openStory(entry: EventLogEntry) {
    setStoryRootId(entry.id)
    setTab("story")
  }

  async function generateBaseline() {
    setGeneratingBaseline(true)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/log/baseline`, { method: "POST" })
      if (!res.ok) throw new Error("Erreur")
      const data = await res.json()
      setAnnouncement(baselineAnnouncement(data.created))
      if (data.created > 0) fetchEntries()
      setBaselineDone(true)
      try {
        localStorage.setItem(`eventlog-baseline-done:${eventId}`, "1")
      } catch {
        // Same as the read above: no persistence, no harm — worst case the button reappears next visit.
      }
    } catch {
      setAnnouncement("Échec de la génération de l'état initial. Réessayez.")
    } finally {
      setGeneratingBaseline(false)
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar
        entityType={entityType} onEntityType={setEntityType}
        actorType={actorType} onActorType={setActorType}
        action={action} onAction={setAction}
        since={since} onSince={setSince}
        until={until} onUntil={setUntil}
      />

      {!baselineDone && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500 max-w-[60ch]">
            Le journal ne trace que les actions faites depuis sa mise en place. Pour les créneaux et inscriptions déjà existants, générez un état initial pour ne pas laisser le journal vide.
          </p>
          <button
            onClick={generateBaseline}
            disabled={generatingBaseline}
            className="text-xs border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {generatingBaseline ? "Génération…" : "Générer l'état initial"}
          </button>
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div
        role="tablist"
        aria-label="Mode d'affichage du journal"
        className="flex gap-1 border-b border-gray-200"
        onKeyDown={(e) => {
          const next = tabForKey(tab, e.key)
          if (!next) return
          e.preventDefault()
          setTab(next)
          document.getElementById(`tab-${next}`)?.focus()
        }}
      >
        <TabButton id="explore" active={tab === "explore"} onClick={() => setTab("explore")}>Explorer</TabButton>
        <TabButton id="replay" active={tab === "replay"} onClick={() => setTab("replay")}>Rejouer</TabButton>
        <TabButton id="story" active={tab === "story"} onClick={() => setTab("story")}>Récit</TabButton>
      </div>

      <div ref={explorePanelRef} role="tabpanel" id="panel-explore" aria-labelledby="tab-explore" tabIndex={0} hidden={tab !== "explore"}>
        {tab === "explore" && (
          <ExploreList
            entries={entries}
            shiftLabels={shiftLabels}
            loading={loading}
            error={error}
            nextCursor={nextCursor}
            onLoadMore={() => nextCursor && fetchEntries(nextCursor)}
            onReplay={openReplay}
            onStory={openStory}
          />
        )}
      </div>

      <div ref={replayPanelRef} role="tabpanel" id="panel-replay" aria-labelledby="tab-replay" tabIndex={0} hidden={tab !== "replay"}>
        {tab === "replay" && (
          replayEntity
            ? <ReplayView eventId={eventId} scope={replayEntity} onClear={() => setReplayEntity(null)} />
            : <ReplayPicker eventId={eventId} onPick={(c) => setReplayEntity({ entityType: c.entityType, entityId: c.entityId })} />
        )}
      </div>

      <div ref={storyPanelRef} role="tabpanel" id="panel-story" aria-labelledby="tab-story" tabIndex={0} hidden={tab !== "story"}>
        {tab === "story" && (
          storyRootId
            ? <StoryView eventId={eventId} rootId={storyRootId} onClear={() => setStoryRootId(null)} />
            : <StoryPicker eventId={eventId} onPick={setStoryRootId} />
        )}
      </div>
    </div>
  )
}
