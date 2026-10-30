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
import { remindHintText, sendResultIsWarning, sendResultText, type SendResult } from "@/lib/event-availability-text"
import type { AvailabilityOverview, AvailabilityOverviewRow } from "@/lib/event-availability-server"
import { reviewReasonTexts } from "@/lib/availability-correction"
import { flushSync } from "react-dom"

type Member = { id: string; firstName: string; lastName: string; email: string | null; tags: string[] }
type Filter = AnswerState | "all"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** Status pairs of DESIGN.md §2 (Tailwind tokens), never colour alone: the badge says the state in words. */
const STATE_BADGE: Record<AnswerState, string> = {
  none: "bg-amber-100 text-amber-800",
  partial: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  unavailable: "bg-gray-100 text-gray-700",
}

const when = (iso: string, timeZone: string) => formatMoment(new Date(iso), timeZone)

const editButtonId = (volunteerId: string, at: "t" | "m") => `availability-edit-${at}-${volunteerId}`

/** The person's « Voir et corriger » that is on screen: the table's, or the phone list's. */
function visibleEditButton(volunteerId: string): HTMLElement | null {
  return (["t", "m"] as const).map((at) => document.getElementById(editButtonId(volunteerId, at))).find((el) => !!el && el.getClientRects().length > 0) ?? null
}

function lastAnswerText(r: AvailabilityOverviewRow, timeZone: string): string {
  return r.answeredAt ? `${when(r.answeredAt, timeZone)}, ${r.answeredBy === "admin" ? "par l'organisation" : "par la personne"}` : "aucune"
}

function linkText(r: AvailabilityOverviewRow, enabled: boolean, timeZone: string): string {
  if (!r.email) return "Pas d'adresse email : réponses à saisir par l'organisation"
  if (!r.hasLink) return enabled ? "Lien désactivé : demandez de nouveau" : "Lien désactivé (collecte arrêtée)"
  const last = r.lastRemindedAt ?? r.sentAt
  return last ? `${r.lastRemindedAt ? "Relancé" : "Envoyé"} le ${when(last, timeZone)}` : "Lien prêt"
}

/**
 * The organisers' page « Disponibilités » (#1146). Accessibility reviews (2026-10-29, independent
 * review 2026-10-30): a compact filter of toggle buttons with their counts in a labelled group (no
 * big count cards, DESIGN.md), with « Toutes »; a captioned table in a labelled scroll region, whose
 * « Dernière réponse » and « Lien » columns fold into the « État » cell on phones; « Voir et
 * corriger » opens a dialog, never a row expanding inside the table; a row that leaves the filter
 * after a change stays shown until the filter changes; buttons stay on screen (aria-disabled) with
 * their reason; a send that emailed nobody is a warning.
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
  const [warning, setWarning] = useState(false)
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
    visibleEditButton(r.volunteerId)?.focus()
    setWarning(false)
    announce(setStatus, `Disponibilités de ${r.firstName} ${r.lastName} marquées comme vues.`)
    router.refresh()
  }
  const regionRef = useRef<HTMLDivElement>(null)
  const hintId = useId()

  const rows = useMemo(() => overview.rows.filter((r) => filter === "all" || r.state === filter || sticky.has(r.volunteerId)), [overview.rows, filter, sticky])
  const hides = useHidesColumns(regionRef, [rows.length])
  const askedIds = useMemo(() => new Set(overview.rows.map((r) => r.volunteerId)), [overview.rows])
  const remindable = overview.rows.filter((r) => r.state === "none" && r.email && r.hasLink).length
  // Unanswered, with an address, but no valid link (collection turned off then on): asked again, not reminded.
  const withoutLink = enabled ? overview.rows.filter((r) => r.state === "none" && r.email && !r.hasLink).length : 0
  const canSend = enabled && open
  const sendBlocked = !enabled ? "La collecte est arrêtée : réactivez-la dans Informations pour envoyer des demandes." : !open ? "La date limite est passée : choisissez une nouvelle date limite dans Informations pour rouvrir la collecte." : null

  function chooseFilter(f: Filter) {
    setFilter(f)
    setSticky(new Set())
    setWarning(false)
    const count = f === "all" ? overview.rows.length : overview.counts[f]
    announce(setStatus, `${count} personne${count > 1 ? "s" : ""} affichée${count > 1 ? "s" : ""}.`)
  }

  async function remind() {
    setReminding({ busy: true, error: null })
    const outcome = await requestJson<SendResult>(() => fetch(`/api/admin/events/${eventId}/availability/remind`, { method: "POST" }), "La relance n'a pas pu être envoyée.")
    if (!outcome.ok) { setReminding({ busy: false, error: outcome.error }); return }
    setReminding(null)
    setWarning(sendResultIsWarning(outcome.data))
    announce(setStatus, sendResultText(outcome.data, true))
    router.refresh()
  }

  const filters: { id: Filter; label: string; value: number }[] = [
    { id: "all", label: "Toutes", value: overview.rows.length },
    ...(["none", "partial", "complete", "unavailable"] as const).map((s) => ({ id: s, label: ANSWER_STATE_LABELS[s], value: overview.counts[s] })),
  ]

  /** « Voir et corriger » and « Marquer comme vu » of a person, in the table (t) or the phone list (m). */
  function rowActions(r: AvailabilityOverviewRow, at: "t" | "m") {
    const errorId = `availability-seen-error-${at}-${r.volunteerId}`
    const failed = seen?.id === r.volunteerId && !!seen.error
    return (
      <>
        <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:whitespace-nowrap">
          <button id={editButtonId(r.volunteerId, at)} type="button" onClick={() => setEditing(r)} className={`min-h-11 whitespace-nowrap text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}>
            Voir et corriger<span className="sr-only">{` les disponibilités de ${r.firstName} ${r.lastName}`}</span>
          </button>
          {r.reviewReason && (
            <button type="button" onClick={() => void markSeen(r)} aria-disabled={(!!seen && !seen.error) || undefined} aria-busy={(seen?.id === r.volunteerId && !seen.error) || undefined} aria-describedby={failed ? errorId : undefined}
              className={`min-h-11 whitespace-nowrap rounded-xl border border-gray-500 bg-white px-3 py-1 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 ${focusRing}`}>
              {seen?.id === r.volunteerId && !seen.error ? "Enregistrement…" : "Marquer comme vu"}<span className="sr-only">{` : disponibilités de ${r.firstName} ${r.lastName}`}</span>
            </button>
          )}
        </div>
        {r.reviewReason && <p id={failed ? errorId : undefined} role="alert" className={failed ? "text-xs text-red-700 whitespace-normal" : "sr-only"}>{seen?.id === r.volunteerId ? seen.error : null}</p>}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">{deadlineSentence}{" "}<Link href={`/admin/events/${eventId}/edit`} className={`font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`}>Changer la date limite dans Informations</Link></p>
      {!enabled && <p className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">La collecte est arrêtée : les liens envoyés ne fonctionnent plus. Les réponses ci-dessous sont gardées et restent modifiables par l&apos;organisation.</p>}

      <div className="space-y-1">
        <p id="availability-filter-label" className="text-sm font-medium text-gray-700">Personnes sollicitées, par état de réponse</p>
        <div role="group" aria-labelledby="availability-filter-label" className="flex flex-wrap gap-2">
          {filters.map((c) => {
            const on = filter === c.id
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => chooseFilter(c.id)}
                className={`min-h-11 rounded-xl px-3 py-1.5 text-sm text-gray-900 hover:bg-gray-50 ${focusRing} forced-colors:aria-pressed:bg-[Highlight] ${on ? "border-2 border-blue-700 bg-blue-50 font-semibold" : "border border-gray-500 bg-white font-medium"}`}
                data-availability-filter={c.id}
              >
                {c.label} <span className="tabular-nums">({c.value})</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { if (canSend) setAsking(true) }} aria-disabled={!canSend || undefined} aria-describedby={sendBlocked ? "availability-send-blocked" : undefined} className={`min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`} data-availability-ask="1">
          Demander leurs disponibilités
        </button>
        <button type="button" onClick={() => { if (canSend && remindable > 0) setReminding({ busy: false, error: null }) }} aria-disabled={!canSend || remindable === 0 || undefined} aria-describedby={sendBlocked ? "availability-send-blocked availability-remind-hint" : "availability-remind-hint"} className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ${focusRing}`}>
          Relancer les personnes sans réponse
        </button>
      </div>
      {sendBlocked && <p id="availability-send-blocked" className="text-sm text-gray-700">{sendBlocked}</p>}
      <p id="availability-remind-hint" className="text-sm text-gray-700" data-availability-remind-hint="1">{remindHintText(remindable, withoutLink)}</p>
      <p role="status" className={!status ? "sr-only" : warning ? "text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2" : "text-sm text-gray-800"} data-availability-send-result={status ? (warning ? "warning" : "ok") : undefined}>{status}</p>

      {overview.rows.length === 0 ? (
        <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-6 text-center">Personne n&apos;a encore été sollicité. Choisissez des membres avec « Demander leurs disponibilités ».</p>
      ) : (
        <>
          {/* Phones: one entry per person, every column in words (no table to scroll sideways). */}
          <ul role="list" aria-label="Personnes sollicitées" className="sm:hidden bg-white border border-gray-200 rounded-xl divide-y divide-gray-100" data-availability-list="1">
            {rows.map((r) => (
              <li key={r.volunteerId} className="px-4 py-3 space-y-1 text-sm" data-availability-row={r.volunteerId}>
                <p className="font-medium text-gray-900">{r.firstName} {r.lastName}</p>
                {reviewReasonTexts(r.reviewReason).map((t) => <p key={t} className="text-xs text-amber-800">{t}</p>)}
                <p><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[r.state]}`}>{ANSWER_STATE_LABELS[r.state]}</span> <span className="text-gray-800">{datesCountText(r.answeredDates, overview.dates.length)}</span></p>
                <p className="text-gray-700">Dernière réponse : {lastAnswerText(r, overview.timeZone)}</p>
                <p className="text-gray-700">Lien : {linkText(r, enabled, overview.timeZone)}</p>
                {rowActions(r, "m")}
              </li>
            ))}
          </ul>
          <div className="hidden sm:block space-y-2">
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
                      {reviewReasonTexts(r.reviewReason).map((t) => <span key={t} className="block text-xs font-normal text-amber-800">{t}</span>)}
                    </th>
                    <td className="px-4 py-2"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[r.state]}`}>{ANSWER_STATE_LABELS[r.state]}</span></td>
                    <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{datesCountText(r.answeredDates, overview.dates.length)}</td>
                    <td className="px-4 py-2 text-gray-800">{lastAnswerText(r, overview.timeZone)}</td>
                    <td className="px-4 py-2 text-gray-800">{linkText(r, enabled, overview.timeZone)}</td>
                    <td className="px-4 py-2">{rowActions(r, "t")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          onDone={(text, isWarning) => {
            setAsking(false)
            setWarning(isWarning)
            // After the dialog gave focus back to its button, so the result is not cut off.
            setTimeout(() => announce(setStatus, text), 150)
            router.refresh()
          }}
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
            setWarning(false)
            announce(setStatus, `Correction enregistrée pour ${name}.`)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function AskModal({ eventId, members, allTags, askedIds, onClose, onDone }: { eventId: string; members: Member[]; allTags: string[]; askedIds: Set<string>; onClose: () => void; onDone: (text: string, warning: boolean) => void }) {
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
    onDone(sendResultText(outcome.data), sendResultIsWarning(outcome.data))
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
          <button type="button" onClick={() => setSelected((s) => new Set([...s, ...visible.map((m) => m.id)]))} className={`min-h-11 text-blue-700 underline underline-offset-2 rounded ${focusRing}`}>{visible.length === 1 ? "Sélectionner le membre affiché" : `Sélectionner les ${visible.length} membres affichés`}</button>
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
