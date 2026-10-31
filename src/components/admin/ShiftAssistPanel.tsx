"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { announce } from "@/lib/announce"
import { focusFirstAvailable } from "@/lib/focus-return"
import { NETWORK_ERROR } from "@/lib/use-submit"
import {
  ackLabel, committedHoursText, filterCandidates, fitDetail, FIT_LABELS, groupCandidates, SPREAD_SORT_EXPLANATION,
  type AssistSort, type CandidateRow, type FitState,
} from "@/lib/availability-assist"
import { fmtDuration } from "@/lib/signup-recap"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const linkClass = `font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded ${focusRing}`

/**
 * Status pairs of DESIGN.md §2, never colour alone: the badge says the fit in words. No blue pair
 * (the action colour); a transparent border keeps the badge outlined in forced colours.
 */
const FIT_BADGE: Record<FitState, string> = {
  full: "bg-[#dcfce7] text-[#15803d]",
  partial: "bg-[#f3e8ff] text-[#6b21a8]",
  unknown: "bg-[#fef3c7] text-[#92400e]",
  outside: "bg-[#f3f4f6] text-[#374151]",
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** « Nadia Rochat », or « Nadia Rochat (nadia.rochat@example.org) » when another listed person has the same name. */
const spokenName = (row: CandidateRow) => `${row.firstName} ${row.lastName}${row.sameNameHint ? ` (${row.sameNameHint})` : ""}`

const NOW_NOTE_ID = "assist-now-note"
const groupHeadingId = (state: FitState) => `assist-group-${state}`

/** Why a box is marked: never ticked, or ticked for an answer that changed since (a 409 « availability »). */
type AckError = "missing" | "changed"

/**
 * The per-shift panel « Affecter selon les disponibilités » (#1146, lot B): the people grouped by
 * their availability for the shift (independent review: the best first, never « Pas disponible » at
 * the top), each card with hours already planned, breaks and the workload verdict. « Ajouter en
 * brouillon » is the card's main action; « Inscrire maintenant » registers at once and may send an
 * email, said by a note every such button points to. The organiser decides; nobody is added
 * without a click, and a person who said they are not available needs the acknowledgement ticked
 * first (owner decision 6), a tick that holds for that exact answer only (keyed by its ackKey).
 * Accessibility reviews (2026-10-30, 2026-10-31): h2 list, h3 groups, h4 cards; sort as a
 * pressed-button group; acknowledgement validated on click (error tied to the box, focus on it, no
 * second alert); one polite status region; after an addition, focus on the next card's heading in
 * the reading order once the list re-rendered.
 */
export default function ShiftAssistPanel({ eventId, shift, rows }: {
  eventId: string
  shift: { id: string; name: string }
  rows: CandidateRow[]
}) {
  const router = useRouter()
  const [sort, setSort] = useState<AssistSort>("spread")
  const [fullOnly, setFullOnly] = useState(false)
  const [status, setStatus] = useState("")
  // Ticks by acknowledgement key: a refreshed answer brings a new key, whose box starts unticked.
  const [acks, setAcks] = useState<Record<string, true>>({})
  const [ackErrors, setAckErrors] = useState<Record<string, AckError>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Which action runs, for whom: only the pressed button says so, both stay aria-disabled.
  const [busy, setBusy] = useState<{ id: string; action: "add" | "draft" } | null>(null)
  // After an immediate add, the person leaves the list: the ids around them, in reading order.
  const focusAfter = useRef<{ next: string | null; previous: string | null; group: FitState } | null>(null)
  // A refusal that re-reads the page: focus on that person's box, else their button or heading.
  const focusRefusal = useRef<string | null>(null)
  // A draft added: focus on the sentence that replaced the buttons, which says it (no status).
  const focusDraftDone = useRef<string | null>(null)
  // What to say once focus has moved after the refresh (150 ms later, so the move does not cut it).
  const sayAfterFocus = useRef<string | null>(null)
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current) }, [])
  const listHeading = useRef<HTMLHeadingElement>(null)
  const shiftSpoken = shift.name.replace(" · ", ", ")

  const groups = useMemo(() => groupCandidates(filterCandidates(rows, fullOnly), sort), [rows, sort, fullOnly])
  const shown = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const ackedOf = (row: CandidateRow) => !!row.ackKey && !!acks[row.ackKey]

  useEffect(() => {
    const byId = (id: string) => () => document.getElementById(id)
    const refused = focusRefusal.current
    const drafted = focusDraftDone.current
    const after = focusAfter.current
    if (refused) {
      focusRefusal.current = null
      focusFirstAvailable([byId(`assist-ack-${refused}`), byId(`assist-draft-${refused}`), byId(`assist-name-${refused}`), listHeading.current])
    } else if (drafted) {
      // After a draft (#1146, lot C) the person stays listed: the sentence that replaced the buttons.
      focusDraftDone.current = null
      focusFirstAvailable([byId(`assist-draft-done-${drafted}`), byId(`assist-name-${drafted}`), listHeading.current])
    } else if (after) {
      focusAfter.current = null
      const heading = (id: string | null) => () => (id ? document.getElementById(`assist-name-${id}`) : null)
      focusFirstAvailable([heading(after.next), heading(after.previous), byId(groupHeadingId(after.group)), listHeading.current])
    } else return
    const text = sayAfterFocus.current
    sayAfterFocus.current = null
    if (text) {
      if (statusTimer.current) clearTimeout(statusTimer.current)
      setStatus("")
      statusTimer.current = setTimeout(() => setStatus(text), 150)
    }
  }, [shown])

  function chooseSort(next: AssistSort) {
    setSort(next)
    announce(setStatus, next === "name" ? "Tri par nom dans chaque groupe." : "Tri pour répartir la charge dans chaque groupe.")
  }
  function toggleFullOnly(next: boolean) {
    setFullOnly(next)
    const count = filterCandidates(rows, next).length
    announce(setStatus, count === 0 ? "Aucune personne affichée." : `${plural(count, "personne affichée", "personnes affichées")}${next ? ", disponibles sur tout le créneau" : ""}.`)
  }

  /** The box is ticked for the answer shown; else it is marked and focused, nothing is sent. */
  function ackReady(row: CandidateRow): boolean {
    if (!row.ackKey || ackedOf(row)) return true
    flushSync(() => setAckErrors((e) => ({ ...e, [row.volunteerId]: "missing" })))
    document.getElementById(`assist-ack-${row.volunteerId}`)?.focus()
    return false
  }

  /**
   * A refusal. A 409 « availability » (the answer or the shift changed meanwhile): the page is read
   * again and the person's box, under its new key, says why; the card's alert only when no box comes
   * back (accessibility plan review: never both).
   */
  function refused(row: CandidateRow, data: { error?: unknown; code?: unknown } | null, fallback: string) {
    const error = typeof data?.error === "string" ? data.error : fallback
    if (data?.code === "availability") {
      // « changed » only for a box that was ticked for the answer shown; otherwise it is just missing.
      setAckErrors((e) => ({ ...e, [row.volunteerId]: ackedOf(row) ? "changed" : "missing" }))
      setErrors((e) => ({ ...e, [row.volunteerId]: error }))
      focusRefusal.current = row.volunteerId
      startTransition(() => router.refresh())
      return
    }
    setErrors((e) => ({ ...e, [row.volunteerId]: error }))
  }

  async function add(row: CandidateRow) {
    if (busy) { announce(setStatus, "Un ajout est en cours : attendez sa réponse."); return }
    const name = spokenName(row)
    if (!ackReady(row)) return
    setBusy({ id: row.volunteerId, action: "add" })
    setErrors((e) => ({ ...e, [row.volunteerId]: "" }))
    try {
      const res = await fetch("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, volunteerId: row.volunteerId, shiftIds: [shift.id], ...(row.ackKey ? { availabilityAck: [row.ackKey] } : {}) }),
      })
      setBusy(null)
      if (!res.ok) { refused(row, await res.json().catch(() => null), "L'inscription n'a pas abouti."); return }
    } catch {
      setBusy(null)
      setErrors((e) => ({ ...e, [row.volunteerId]: NETWORK_ERROR }))
      return
    }
    sayAfterFocus.current = `${name} est maintenant inscrit·e sur ${shiftSpoken}.`
    const group = groups.find((g) => g.rows.some((r) => r.volunteerId === row.volunteerId))!
    const index = shown.findIndex((r) => r.volunteerId === row.volunteerId)
    const inGroup = group.rows.findIndex((r) => r.volunteerId === row.volunteerId)
    focusAfter.current = { next: group.rows[inGroup + 1]?.volunteerId ?? null, previous: shown[index - 1]?.volunteerId ?? shown[index + 1]?.volunteerId ?? null, group: group.state }
    startTransition(() => router.refresh())
  }

  /** « Ajouter en brouillon » (#1146, lot C): prepared, not published, no place held, nobody told. */
  async function addDraft(row: CandidateRow) {
    if (busy) { announce(setStatus, "Un ajout est en cours : attendez sa réponse."); return }
    if (!ackReady(row)) return
    setBusy({ id: row.volunteerId, action: "draft" })
    setErrors((e) => ({ ...e, [row.volunteerId]: "" }))
    try {
      const res = await fetch(`/api/admin/events/${eventId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id, volunteerId: row.volunteerId, ackKey: row.ackKey ?? null }),
      })
      setBusy(null)
      if (!res.ok) { refused(row, await res.json().catch(() => null), "Le brouillon n'a pas été ajouté."); return }
    } catch {
      setBusy(null)
      setErrors((e) => ({ ...e, [row.volunteerId]: NETWORK_ERROR }))
      return
    }
    // Said by the focused sentence that replaces the buttons, never also by the status.
    focusDraftDone.current = row.volunteerId
    startTransition(() => router.refresh())
  }

  const explanationId = "assist-sort-explanation"
  return (
    <section aria-labelledby="assist-list-heading" className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p id="assist-sort-label" className="text-xs font-medium text-gray-700 mb-1">Trier dans chaque groupe</p>
          <div role="group" aria-labelledby="assist-sort-label" className="flex">
            {([["spread", "Pour répartir la charge"], ["name", "Par nom"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                aria-describedby={value === "spread" && sort === "spread" ? explanationId : undefined}
                onClick={() => chooseSort(value)}
                className={`min-h-11 sm:min-h-9 border border-gray-500 px-3 py-1.5 text-sm font-medium first:rounded-l-xl last:rounded-r-xl -ml-px first:ml-0 ${sort === value ? "bg-blue-50 text-blue-800 border-blue-600 font-semibold ring-2 ring-inset ring-blue-600 relative z-10" : "bg-white text-gray-800 hover:bg-gray-50"} forced-colors:aria-pressed:bg-[Highlight] ${focusRing} focus-visible:relative focus-visible:z-20`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" checked={fullOnly} onChange={(e) => toggleFullOnly(e.target.checked)} className="h-5 w-5 accent-blue-600" />
          Disponibles sur tout le créneau seulement
        </label>
      </div>
      {sort === "spread" && <p id={explanationId} className="max-w-[75ch] text-sm text-gray-700">{SPREAD_SORT_EXPLANATION}</p>}
      <p role="status" className={status ? "text-sm text-gray-800" : "sr-only"}>{status}</p>

      <h2 id="assist-list-heading" ref={listHeading} tabIndex={-1} className="text-sm font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Personnes à affecter ({shown.length})
      </h2>
      <p id={NOW_NOTE_ID} className="max-w-[75ch] text-sm text-gray-700">
        « Ajouter en brouillon » prépare l&apos;affectation sans prendre de place ni rien envoyer, jusqu&apos;à la publication. « Inscrire maintenant » inscrit la personne tout de suite : elle reçoit un email si elle a une adresse.
      </p>
      {shown.length === 0 ? (
        <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-6 text-center">
          {rows.length === 0 ? "Personne à proposer pour ce créneau." : "Personne n'est disponible sur tout le créneau : décochez « Disponibles sur tout le créneau seulement » pour voir tout le monde."}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.state} aria-labelledby={groupHeadingId(group.state)} className="space-y-3">
            <h3 id={groupHeadingId(group.state)} tabIndex={-1} className="text-sm font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              {group.label} ({group.rows.length})
            </h3>
            <ul role="list" className="space-y-3">
              {group.rows.map((row) => (
                <CandidateCard
                  key={row.volunteerId}
                  row={row}
                  busy={busy?.id === row.volunteerId ? busy.action : null}
                  anyBusy={!!busy}
                  draftsHref={`/admin/events/${eventId}/availability/drafts`}
                  acked={ackedOf(row)}
                  ackError={ackErrors[row.volunteerId] ?? null}
                  error={errors[row.volunteerId] || null}
                  onAck={(v) => {
                    if (!row.ackKey) return
                    const key = row.ackKey
                    setAcks((a) => { const next = { ...a }; if (v) next[key] = true; else delete next[key]; return next })
                    if (v) {
                      setAckErrors((e) => { const next = { ...e }; delete next[row.volunteerId]; return next })
                      setErrors((e) => ({ ...e, [row.volunteerId]: "" }))
                    }
                  }}
                  onAdd={() => void add(row)}
                  onDraft={() => void addDraft(row)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}

function CandidateCard({ row, busy, anyBusy, draftsHref, acked, ackError, error, onAck, onAdd, onDraft }: {
  row: CandidateRow
  busy: "add" | "draft" | null
  anyBusy: boolean
  draftsHref: string
  onDraft: () => void
  acked: boolean
  ackError: AckError | null
  error: string | null
  onAck: (v: boolean) => void
  onAdd: () => void
}) {
  const id = row.volunteerId
  const name = spokenName(row)
  const detail = fitDetail(row.fit)
  const [firstWorkload, ...otherWorkload] = row.workload
  // A refusal the box explains is not said again by the card's alert (never both).
  const boxError = !!row.ackKey && !row.draftOnShift && !!ackError
  const alertText = boxError ? null : error
  const errorId = `assist-error-${id}`
  const describedBy = (extra?: string) => [extra, alertText && errorId].filter(Boolean).join(" ") || undefined
  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4 space-y-2" data-assist-row={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 id={`assist-name-${id}`} tabIndex={-1} className="text-base font-semibold text-gray-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {row.firstName} {row.lastName}
          {/* Two people of the same name (#1146, lot B): told apart by their email, inside the heading. */}
          {row.sameNameHint && <><span className="sr-only">, </span><span className="block text-sm font-normal text-gray-700 break-all">{row.sameNameHint}</span></>}
        </h4>
        <span className={`inline-block rounded-full border border-transparent px-2 py-0.5 text-xs font-medium ${FIT_BADGE[row.fit.state]}`}>{FIT_LABELS[row.fit.state]}</span>
      </div>
      {detail && <p id={`assist-detail-${id}`} className="text-sm text-gray-700">{detail}</p>}
      {row.reviewTexts.map((t) => <p key={t} className="text-sm text-[#92400e]">{t}</p>)}
      <ul role="list" className="text-sm text-gray-700 space-y-0.5">
        <li>{committedHoursText(row.minutes)}{row.minutes.sameDay > 0 ? `, dont ${fmtDuration(row.minutes.sameDay)} ${row.sameDayLabel}` : ""}.</li>
        {row.backToBack.length > 0 && <li>Enchaîne sans pause avec {row.backToBack.join(", ")}.</li>}
        {row.overlaps.length > 0 && <li>Chevauche {row.overlaps.join(", ")}.</li>}
      </ul>
      {!row.eligible ? (
        <div className="text-sm text-red-800">
          <p><strong className="font-semibold">Ajout impossible :</strong> {firstWorkload}</p>
          {otherWorkload.length > 0 && <ul role="list" className="mt-1 space-y-0.5">{otherWorkload.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      ) : (
        <>
          {row.workload.length > 0 && (
            <div className="text-sm text-amber-950 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
              <p className="font-medium">Si vous l&apos;ajoutez, cette personne aura :</p>
              <ul role="list" className="mt-1 space-y-0.5">{row.workload.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="mt-1">L&apos;ajout reste possible.</p>
            </div>
          )}
          {row.ackKey && !row.draftOnShift && (
            <div>
              <label className="flex min-h-11 items-start gap-2 py-1 text-sm text-gray-900 cursor-pointer">
                <input
                  id={`assist-ack-${id}`}
                  type="checkbox"
                  checked={acked}
                  onChange={(e) => onAck(e.target.checked)}
                  aria-invalid={!!ackError || undefined}
                  aria-describedby={[ackError && `assist-ack-error-${id}`, detail && `assist-detail-${id}`].filter(Boolean).join(" ") || undefined}
                  className="mt-0.5 h-6 w-6 shrink-0 accent-blue-600"
                />
                <span>{ackLabel(row.firstName)}{row.sameNameHint && <span className="sr-only">{` (${row.sameNameHint})`}</span>}</span>
              </label>
              {ackError && (
                <p id={`assist-ack-error-${id}`} className="text-sm text-red-700">
                  {ackError === "changed" ? "Ses disponibilités ou les horaires ont changé entre-temps : relisez-les, puis cochez de nouveau. " : ""}Cochez cette case pour ajouter {name} malgré ses disponibilités : rien n&apos;a encore été fait.
                </p>
              )}
            </div>
          )}
          {row.draftOnShift ? (
            <p id={`assist-draft-done-${id}`} tabIndex={-1} className={`text-sm text-gray-800 rounded ${focusRing}`}>
              Un brouillon existe déjà pour ce créneau : publiez-le ou retirez-le dans{" "}
              <Link href={draftsHref} className={linkClass}>Affectations en brouillon</Link>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                id={`assist-draft-${id}`}
                type="button"
                onClick={onDraft}
                aria-disabled={anyBusy || undefined}
                aria-busy={busy === "draft" || undefined}
                aria-describedby={describedBy()}
                className={`min-h-11 rounded-xl border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 ${anyBusy ? "opacity-60" : ""} ${busy === "draft" ? "cursor-wait" : ""} ${focusRing}`}
              >
                {busy === "draft" ? "Ajout en cours…" : "Ajouter en brouillon"}{" "}<span className="sr-only">: {name}</span>
              </button>
              <button
                id={`assist-add-${id}`}
                type="button"
                onClick={onAdd}
                aria-disabled={anyBusy || undefined}
                aria-busy={busy === "add" || undefined}
                aria-describedby={describedBy(NOW_NOTE_ID)}
                className={`min-h-11 rounded-xl border border-gray-500 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 ${anyBusy ? "opacity-60" : ""} ${busy === "add" ? "cursor-wait" : ""} ${focusRing}`}
              >
                {busy === "add" ? "Inscription en cours…" : "Inscrire maintenant"}{" "}<span className="sr-only">: {name}</span>
              </button>
            </div>
          )}
          {/* Always mounted, filled on error: an alert that appears with its text is not always read. */}
          <p id={errorId} role="alert" className={alertText ? "text-sm text-red-700" : "sr-only"}>{alertText}</p>
        </>
      )}
    </li>
  )
}
