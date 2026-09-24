"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { describeChanges, describeEntry, narrateChain } from "@/lib/event-log-narrative"
import type { ShiftLabel } from "@/lib/event-log-read"

export type EventLogEntry = {
  id: string
  eventId: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: Record<string, { from: unknown; to: unknown }> | null
  causedByLogId: string | null
  createdAt: string
}

const ENTITY_LABELS: Record<string, string> = {
  Shift: "Créneau",
  Registration: "Inscription",
  Event: "Événement",
  MemberInvite: "Invitation",
  EventPage: "Page",
  SectorLeader: "Responsable de secteur",
  EventMilestone: "Jalon",
}

const ACTOR_TYPE_LABELS: Record<string, string> = {
  admin: "Admin",
  volunteer: "Bénévole",
  system: "Système",
}

const ACTION_PREFIXES = [
  { value: "", label: "Toutes les actions" },
  { value: "shift", label: "Créneaux" },
  { value: "registration", label: "Inscriptions" },
  { value: "event", label: "Événement" },
  { value: "memberinvite", label: "Invitations" },
  { value: "eventpage", label: "Pages" },
  { value: "sectorleader", label: "Responsables de secteur" },
  { value: "eventmilestone", label: "Jalons" },
]

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function entityBadgeClass(entityType: string) {
  switch (entityType) {
    case "Shift": return "bg-indigo-100 text-indigo-700"
    case "Registration": return "bg-emerald-100 text-emerald-700"
    case "Event": return "bg-blue-100 text-blue-700"
    default: return "bg-gray-100 text-gray-600"
  }
}

/** A "*.baseline" entry is a synthetic snapshot (see the baseline endpoint), not a real logged
 *  action — visually distinct (grey, not colored) so it never reads as something that happened. */
function isBaseline(action: string) {
  return action.endsWith(".baseline")
}

type Tab = "explore" | "replay" | "story"

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
    const params = new URLSearchParams()
    if (entityType) params.set("entityType", entityType)
    if (actorType) params.set("actorType", actorType)
    if (action) params.set("action", action)
    if (since) params.set("since", new Date(since).toISOString())
    if (until) params.set("until", new Date(until).toISOString())
    if (cursor) params.set("cursor", cursor)

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
        setAnnouncement(
          cursor
            ? `${data.entries.length} entrée${data.entries.length > 1 ? "s" : ""} supplémentaire${data.entries.length > 1 ? "s" : ""} chargée${data.entries.length > 1 ? "s" : ""}.`
            : `${data.entries.length} entrée${data.entries.length > 1 ? "s" : ""} trouvée${data.entries.length > 1 ? "s" : ""}.`,
        )
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
      setAnnouncement(
        data.created > 0
          ? `${data.created} état${data.created > 1 ? "s" : ""} initial${data.created > 1 ? "aux" : ""} généré${data.created > 1 ? "s" : ""}.`
          : "Rien à générer : tout est déjà suivi.",
      )
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
          const order: Tab[] = ["explore", "replay", "story"]
          const i = order.indexOf(tab)
          let next: Tab | null = null
          if (e.key === "ArrowRight") next = order[(i + 1) % order.length]
          else if (e.key === "ArrowLeft") next = order[(i - 1 + order.length) % order.length]
          else if (e.key === "Home") next = order[0]
          else if (e.key === "End") next = order[order.length - 1]
          else return
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

// Arrow/Home/End handling lives on the parent role="tablist" (one listener, no synthetic event
// dispatch needed to activate the next tab — see the tablist's onKeyDown above).
function TabButton({ id, active, onClick, children }: { id: Tab; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`panel-${id}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  )
}

function EmptyTabPrompt({ text }: { text: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-sm text-gray-600 text-center">
      {text}
    </div>
  )
}

interface ReplayCandidate { entityType: string; entityId: string; label: string; count: number }

/**
 * Lets "Rejouer" be used directly from its own tab: lists every entity with more than one log
 * entry (the only ones worth stepping through) instead of only being reachable via a row's
 * "Rejouer" button in Explorer.
 */
function ReplayPicker({ eventId, onPick }: { eventId: string; onPick: (c: ReplayCandidate) => void }) {
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
function StoryPicker({ eventId, onPick }: { eventId: string; onPick: (logId: string) => void }) {
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

function FilterBar(props: {
  entityType: string; onEntityType: (v: string) => void
  actorType: string; onActorType: (v: string) => void
  action: string; onAction: (v: string) => void
  since: string; onSince: (v: string) => void
  until: string; onUntil: (v: string) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
      <Field label="Type d'élément">
        <select className="input" value={props.entityType} onChange={(e) => props.onEntityType(e.target.value)}>
          <option value="">Tous</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Qui">
        <select className="input" value={props.actorType} onChange={(e) => props.onActorType(e.target.value)}>
          <option value="">Tous</option>
          {Object.entries(ACTOR_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <Field label="Action">
        <select className="input" value={props.action} onChange={(e) => props.onAction(e.target.value)}>
          {ACTION_PREFIXES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </Field>
      <Field label="Depuis">
        <input type="date" className="input" value={props.since} onChange={(e) => props.onSince(e.target.value)} />
      </Field>
      <Field label="Jusqu'à">
        <input type="date" className="input" value={props.until} onChange={(e) => props.onUntil(e.target.value)} />
      </Field>
    </div>
  )
}

// `htmlFor` must point at the actual control, not a wrapping <div> — that only works when
// `for` is absent (implicit nesting). With `for` present but pointing at a non-labelable
// element, no control gets an accessible name at all. Implicit nesting (label wraps control
// directly, no `for`/`id`) is correct here since every caller passes exactly one form control.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <div>{children}</div>
    </label>
  )
}

function ExploreList({
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

  // "Rejouer" steps through an entity's history — pointless with a single step. Counted from
  // what's actually loaded: an accurate lower bound (a paginated-away entry could make the real
  // total higher), never wrong in the direction that would offer a scrubber with nothing to
  // scrub through.
  const entryCountByEntityId = new Map<string, number>()
  for (const e of entries) entryCountByEntityId.set(e.entityId, (entryCountByEntityId.get(e.entityId) ?? 0) + 1)

  return (
    <div className="space-y-2">
      {entries.map((entry) => {
        const baseline = isBaseline(entry.action)
        return (
        <div key={entry.id} className={`border rounded-xl p-4 ${baseline ? "bg-gray-50 border-gray-100" : "bg-white border-gray-200"}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${baseline ? "bg-gray-100 text-gray-500" : entityBadgeClass(entry.entityType)}`}>
                  {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
                </span>
                {baseline && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    Généré, pas une action réelle
                  </span>
                )}
                <span className="text-xs text-gray-400">{fmtDateTime(entry.createdAt)}</span>
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

function ReplayView({
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
          <p className="text-xs text-gray-400">{fmtDateTime(entry.createdAt)}</p>
          {isBaseline(entry.action) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
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

function StoryView({ eventId, rootId, onClear }: { eventId: string; rootId: string; onClear: () => void }) {
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
