"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { announce } from "@/lib/announce"
import { requestJson } from "@/lib/use-submit"
import { TABLE_SCROLL_HINT } from "@/lib/table-overflow"
import { formatMoment } from "@/lib/registration-window"
import { useHidesColumns } from "@/components/admin/members/useHidesColumns"
import ModalShell from "@/components/admin/ModalShell"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import AvailabilityEditor, { type SaveOutcome } from "@/components/AvailabilityEditor"
import { ANSWER_STATE_LABELS, type AnswerState, type DayAnswerInput } from "@/lib/event-availability"
import { datesCountText } from "@/lib/availability-editor"
import { sendResultText, type SendResult } from "@/lib/event-availability-text"
import type { AvailabilityOverview, AvailabilityOverviewRow } from "@/lib/event-availability-server"
import { reviewReasonTexts } from "@/lib/availability-correction"
import { flushSync } from "react-dom"

type Member = { id: string; firstName: string; lastName: string; email: string | null; tags: string[] }
type Filter = AnswerState | "all"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Status pairs of DESIGN.md §2, never colour alone: the badge says the state in words. */
const STATE_BADGE: Record<AnswerState, string> = {
  none: "bg-[#fef3c7] text-[#92400e]",
  partial: "bg-[#dbeafe] text-[#1d4ed8]",
  complete: "bg-[#dcfce7] text-[#15803d]",
  unavailable: "bg-[#f3f4f6] text-[#374151]",
}

const when = (iso: string, timeZone: string) => formatMoment(new Date(iso), timeZone)

function linkText(r: AvailabilityOverviewRow, enabled: boolean, timeZone: string): string {
  if (!r.email) return "Pas d'adresse email : réponses à saisir par l'organisation"
  if (!r.hasLink) return enabled ? "Lien désactivé : demandez de nouveau" : "Lien désactivé (collecte arrêtée)"
  const last = r.lastRemindedAt ?? r.sentAt
  return last ? `${r.lastRemindedAt ? "Relancé" : "Envoyé"} le ${when(last, timeZone)}` : "Lien prêt"
}

/**
 * The organisers' page « Disponibilités » (#1146). Accessibility review (2026-10-29): count cards
 * as filter toggles in a labelled group, with « Toutes »; a captioned table in a labelled scroll
 * region (the 320 px exemption of data tables); « Voir et corriger » opens a dialog, never a row
 * expanding inside the table; a row that leaves the filter after a change stays shown until the
 * filter changes; buttons stay on screen (aria-disabled) with their reason.
 */
export default function AvailabilityManager({ eventId, enabled, open, deadlineSentence, overview, members, allTags }: {
  eventId: string
  enabled: boolean
  open: boolean
  deadlineSentence: string
  overview: AvailabilityOverview
  members: Member[]
  allTags: string[]
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>("all")
  const [sticky, setSticky] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState("")
  const [asking, setAsking] = useState(false)
  const [reminding, setReminding] = useState<{ busy: boolean; error: string | null } | null>(null)
  const [editing, setEditing] = useState<AvailabilityOverviewRow | null>(null)
  // « Marquer comme vu » (#1146, lot C): the row whose flag is being cleared, and its error.
  const [seen, setSeen] = useState<{ id: string; error: string | null } | null>(null)

  async function markSeen(r: AvailabilityOverviewRow) {
    if (seen && !seen.error) { announce(setStatus, "Une action est en cours : attendez sa réponse."); return }
    setSeen({ id: r.volunteerId, error: null })
    const res = await requestJson(() => fetch(`/api/admin/events/${eventId}/availability/${r.volunteerId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: r.revision }) }))
    if (!res.ok) { setSeen({ id: r.volunteerId, error: res.error }); return }
    flushSync(() => setSeen(null))
    document.getElementById(`availability-edit-${r.volunteerId}`)?.focus()
    announce(setStatus, `Disponibilités de ${r.firstName} ${r.lastName} marquées comme vues.`)
    router.refresh()
  }
  const regionRef = useRef<HTMLDivElement>(null)
  const hintId = useId()

  const rows = useMemo(() => overview.rows.filter((r) => filter === "all" || r.state === filter || sticky.has(r.volunteerId)), [overview.rows, filter, sticky])
  const hides = useHidesColumns(regionRef, [rows.length])
  const askedIds = useMemo(() => new Set(overview.rows.map((r) => r.volunteerId)), [overview.rows])
  const remindable = overview.rows.filter((r) => r.state === "none" && r.email && r.hasLink).length
  const canSend = enabled && open
  const sendBlocked = !enabled ? "La collecte est arrêtée : réactivez-la dans Informations pour envoyer des demandes." : !open ? "La date limite est passée : choisissez une nouvelle date limite dans Informations pour rouvrir la collecte." : null

  function chooseFilter(f: Filter) {
    setFilter(f)
    setSticky(new Set())
    const count = f === "all" ? overview.rows.length : overview.counts[f]
    announce(setStatus, `${count} personne${count > 1 ? "s" : ""} affichée${count > 1 ? "s" : ""}.`)
  }

  async function remind() {
    setReminding({ busy: true, error: null })
    const outcome = await requestJson<SendResult>(() => fetch(`/api/admin/events/${eventId}/availability/remind`, { method: "POST" }), "La relance n'a pas pu être envoyée.")
    if (!outcome.ok) { setReminding({ busy: false, error: outcome.error }); return }
    setReminding(null)
    announce(setStatus, sendResultText(outcome.data, true))
    router.refresh()
  }

  const cards: { id: Filter; label: string; value: number }[] = [
    { id: "all", label: "Toutes les personnes sollicitées", value: overview.rows.length },
    ...(["none", "partial", "complete", "unavailable"] as const).map((s) => ({ id: s, label: ANSWER_STATE_LABELS[s], value: overview.counts[s] })),
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">{deadlineSentence}{" "}<Link href={`/admin/events/${eventId}/edit`} className={`font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}>Changer la date limite dans Informations</Link></p>
      {!enabled && <p className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">La collecte est arrêtée : les liens envoyés ne fonctionnent plus. Les réponses ci-dessous sont gardées et restent modifiables par l&apos;organisation.</p>}

      <div role="group" aria-label="Filtrer par état de réponse" className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => chooseFilter(c.id)}
            className={`min-h-11 rounded-xl border border-gray-300 bg-white p-3 text-center text-gray-900 ${focusRing} forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText] ${filter === c.id ? "ring-2 ring-blue-600 ring-offset-1" : ""}`}
            data-availability-filter={c.id}
          >
            <span className="block text-xl font-bold">{c.value}</span>{" "}
            <span className="block text-xs mt-1 text-gray-700">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { if (canSend) setAsking(true) }} aria-disabled={!canSend || undefined} aria-describedby={sendBlocked ? "availability-send-blocked" : undefined} className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`} data-availability-ask="1">
          Demander leurs disponibilités
        </button>
        <button type="button" onClick={() => { if (canSend && remindable > 0) setReminding({ busy: false, error: null }) }} aria-disabled={!canSend || remindable === 0 || undefined} aria-describedby="availability-remind-hint" className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`}>
          Relancer les personnes sans réponse
        </button>
      </div>
      {sendBlocked && <p id="availability-send-blocked" className="text-xs text-gray-700">{sendBlocked}</p>}
      <p id="availability-remind-hint" className="text-xs text-gray-700">{remindable === 0 ? "Personne à relancer : chaque personne avec un lien a déjà répondu." : `${remindable} personne${remindable > 1 ? "s" : ""} sans réponse. Une personne contactée il y a moins de 48 h n'est pas relancée.`}</p>
      <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>

      {overview.rows.length === 0 ? (
        <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-6 text-center">Personne n&apos;a encore été sollicité. Choisissez des membres avec « Demander leurs disponibilités ».</p>
      ) : (
        <>
          {hides && <p id={hintId} className="max-w-[65ch] text-sm text-gray-600">{TABLE_SCROLL_HINT}</p>}
          <div ref={regionRef} role="region" aria-label="Personnes sollicitées" aria-describedby={hides ? hintId : undefined} tabIndex={hides ? 0 : undefined} className={`relative bg-white border border-gray-200 rounded-xl overflow-x-auto ${focusRing}`}>
            <table className="w-full text-sm min-w-[44rem]">
              <caption className="sr-only">Personnes sollicitées et état de leur réponse</caption>
              <thead className="bg-gray-50 text-xs text-gray-700">
                <tr>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Nom</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">État</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Dates répondues</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Dernière réponse</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Lien</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.volunteerId} data-availability-row={r.volunteerId}>
                    <th scope="row" className="text-left px-4 py-2 font-medium text-gray-900">
                      {r.firstName} {r.lastName}
                      {reviewReasonTexts(r.reviewReason).map((t) => <span key={t} className="block text-xs font-normal text-[#92400e]">{t}</span>)}
                    </th>
                    <td className="px-4 py-2"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[r.state]}`}>{ANSWER_STATE_LABELS[r.state]}</span></td>
                    <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{datesCountText(r.answeredDates, overview.dates.length)}</td>
                    <td className="px-4 py-2 text-gray-800">{r.answeredAt ? `${when(r.answeredAt, overview.timeZone)}, ${r.answeredBy === "admin" ? "par l'organisation" : "par la personne"}` : "—"}</td>
                    <td className="px-4 py-2 text-gray-800">{linkText(r, enabled, overview.timeZone)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 whitespace-nowrap">
                        <button id={`availability-edit-${r.volunteerId}`} type="button" onClick={() => setEditing(r)} className={`min-h-11 whitespace-nowrap text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}>
                          Voir et corriger<span className="sr-only">{` les disponibilités de ${r.firstName} ${r.lastName}`}</span>
                        </button>
                        {r.reviewReason && (
                          <button type="button" onClick={() => void markSeen(r)} aria-disabled={(!!seen && !seen.error) || undefined} aria-busy={(seen?.id === r.volunteerId && !seen.error) || undefined} aria-describedby={seen?.id === r.volunteerId && seen.error ? `availability-seen-error-${r.volunteerId}` : undefined}
                            className={`min-h-11 whitespace-nowrap rounded-xl border border-gray-500 bg-white px-3 py-1 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 ${focusRing}`}>
                            {seen?.id === r.volunteerId && !seen.error ? "Enregistrement…" : "Marquer comme vu"}<span className="sr-only">{` : disponibilités de ${r.firstName} ${r.lastName}`}</span>
                          </button>
                        )}
                      </div>
                      {r.reviewReason && <p id={seen?.id === r.volunteerId && seen.error ? `availability-seen-error-${r.volunteerId}` : undefined} role="alert" className={seen?.id === r.volunteerId && seen.error ? "text-xs text-red-700 whitespace-normal" : "sr-only"}>{seen?.id === r.volunteerId ? seen.error : null}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {asking && (
        <AskModal
          eventId={eventId}
          members={members}
          allTags={allTags}
          askedIds={askedIds}
          onClose={() => setAsking(false)}
          onDone={(text) => { setAsking(false); announce(setStatus, text); router.refresh() }}
        />
      )}
      {reminding && (
        <ConfirmActionModal
          recap={{
            title: "Relancer les personnes sans réponse ?",
            lead: `${remindable} personne${remindable > 1 ? "s" : ""} sans réponse recevr${remindable > 1 ? "ont" : "a"} de nouveau son lien par email, sauf celles contactées il y a moins de 48 h.`,
            lines: ["Le lien reste le même : les réponses déjà commencées ne sont pas perdues."],
            confirmLabel: "Relancer",
            danger: false,
          }}
          busy={reminding.busy}
          error={reminding.error}
          onConfirm={() => void remind()}
          onCancel={() => setReminding(null)}
        />
      )}
      {editing && (
        <CorrectModal
          eventId={eventId}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const name = `${editing.firstName} ${editing.lastName}`
            setSticky((s) => new Set([...s, editing.volunteerId]))
            setEditing(null)
            announce(setStatus, `Correction enregistrée pour ${name}.`)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function AskModal({ eventId, members, allTags, askedIds, onClose, onDone }: { eventId: string; members: Member[]; allTags: string[]; askedIds: Set<string>; onClose: () => void; onDone: (text: string) => void }) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState("")
  const [tag, setTag] = useState("")
  const [hideAsked, setHideAsked] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [hint, setHint] = useState("")
  const [spokenCount, setSpokenCount] = useState("")

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members.filter((m) => (!hideAsked || !askedIds.has(m.id)) && (!tag || m.tags.includes(tag)) && (!q || `${m.firstName} ${m.lastName} ${m.email ?? ""}`.toLowerCase().includes(q)))
  }, [members, search, tag, hideAsked, askedIds])

  const countText = `${visible.length} membre${visible.length > 1 ? "s" : ""} affiché${visible.length > 1 ? "s" : ""}, ${selected.size} sélectionné${selected.size > 1 ? "s" : ""}`
  // Said once typing or ticking pauses (about 500 ms), not at every key (accessibility review).
  useEffect(() => {
    const t = setTimeout(() => setSpokenCount(countText), 500)
    return () => clearTimeout(t)
  }, [countText])

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  async function submit() {
    if (busy) return
    if (selected.size === 0) { announce(setHint, "Choisissez au moins une personne dans la liste."); return }
    setBusy(true); setError("")
    const outcome = await requestJson<SendResult>(() => fetch(`/api/admin/events/${eventId}/availability`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volunteerIds: [...selected] }) }), "Les demandes n'ont pas pu être envoyées.")
    setBusy(false)
    if (!outcome.ok) { announce(setError, `${outcome.error} Votre sélection est conservée.`); return }
    onDone(sendResultText(outcome.data))
  }

  return (
    <ModalShell title="Demander leurs disponibilités" onClose={onClose} panelClassName="max-w-2xl flex flex-col" initialFocusRef={searchRef} closeOnBackdrop={false} busy={busy}>
      <p className="text-sm text-gray-700 mb-3">Chaque personne choisie reçoit par email son lien « Indiquer mes disponibilités ». Une personne déjà sollicitée reçoit le même lien.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="flex-1 min-w-[180px]">
          <span className="block text-xs font-medium text-gray-800 mb-1">Rechercher un membre</span>
          <input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="input w-full" />
        </label>
        <label>
          <span className="block text-xs font-medium text-gray-800 mb-1">Étiquette</span>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="input">
            <option value="">Toutes les étiquettes</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={hideAsked} onChange={(e) => setHideAsked(e.target.checked)} className="h-5 w-5" />
          Cacher les personnes déjà sollicitées
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700 mb-2">
        <p aria-hidden="true">{countText}</p>
        <p role="status" className="sr-only">{spokenCount}</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setSelected((s) => new Set([...s, ...visible.map((m) => m.id)]))} className={`min-h-11 text-blue-700 underline underline-offset-2 rounded ${focusRing}`}>Tout sélectionner</button>
          <button type="button" onClick={() => setSelected(new Set())} className={`min-h-11 text-gray-700 underline underline-offset-2 rounded ${focusRing}`}>Effacer la sélection</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border border-gray-200 rounded-xl">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-700">Aucun membre à afficher.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 items-center gap-3 p-3 cursor-pointer">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="h-5 w-5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900">{m.firstName} {m.lastName}</span>
                    <span className="block text-xs text-gray-700 truncate">{m.email ?? "Pas d'adresse email : vous saisirez ses réponses"}{m.tags.length > 0 && <> · {m.tags.join(", ")}</>}{askedIds.has(m.id) && " · déjà sollicité"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 space-y-2">
        <p role="status" className={hint ? "text-sm text-gray-800" : "sr-only"}>{hint}</p>
        <p role="alert" className={error ? "text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-lg" : "sr-only"}>{error}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={`min-h-11 text-sm px-4 py-2 text-gray-700 hover:text-gray-900 rounded ${focusRing}`}>Annuler</button>
          <button type="button" onClick={() => void submit()} aria-disabled={busy || selected.size === 0 || undefined} className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 ${focusRing}`}>
            {busy ? "Envoi…" : `Envoyer ${selected.size} demande${selected.size > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

type Person = { volunteer: { firstName: string; lastName: string }; dates: string[]; days: { date: string; ranges: { startTime: string; endTime: string }[] }[] }

function CorrectModal({ eventId, row, onClose, onSaved }: { eventId: string; row: AvailabilityOverviewRow; onClose: () => void; onSaved: () => void }) {
  const [person, setPerson] = useState<Person | null>(null)
  const [loadError, setLoadError] = useState("")
  const titleRef = useRef<HTMLParagraphElement>(null)
  const url = `/api/admin/events/${eventId}/availability/${row.volunteerId}`
  const name = `${row.firstName} ${row.lastName}`

  useEffect(() => {
    let live = true
    fetch(url, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error()
      const data = await r.json()
      if (live) setPerson(data)
    }).catch(() => { if (live) setLoadError("Les disponibilités n'ont pas pu être chargées. Fermez puis réessayez.") })
    return () => { live = false }
  }, [url])

  async function save(days: DayAnswerInput[]): Promise<SaveOutcome> {
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : "La correction n'a pas pu être enregistrée. Réessayez.", at: data.at }
    onSaved()
    return { ok: true }
  }

  return (
    <ModalShell title={`Disponibilités de ${name}`} onClose={onClose} panelClassName="max-w-2xl flex flex-col max-sm:h-full" initialFocusRef={titleRef} closeOnBackdrop={false}>
      <div className="overflow-y-auto overflow-x-hidden space-y-3">
        <p ref={titleRef} tabIndex={-1} className="text-sm text-gray-700 focus:outline-none">Votre correction remplace la réponse de ces dates ; elle est enregistrée « par l&apos;organisation », même après la date limite.</p>
        {loadError ? <p role="alert" className="text-sm text-red-800">{loadError}</p> : !person ? <p role="status" className="text-sm text-gray-700">Chargement…</p> : (
          <AvailabilityEditor idPrefix={`fix-${row.volunteerId}`} dates={person.dates} initialDays={person.days} voice="vous" submitLabel="Enregistrer la correction" savedText="Correction enregistrée." onSave={save} />
        )}
      </div>
    </ModalShell>
  )
}
