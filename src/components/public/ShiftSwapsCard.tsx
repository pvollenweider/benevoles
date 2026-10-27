"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import { focusFirstAvailable, isFocusDropped, type FocusCandidate } from "@/lib/focus-return"
import { deadlineMoment } from "@/lib/cancel-deadline"
import { rosterSpokenName, rosterVisibleName } from "@/lib/shift-roster-text"
import { requireTokenPath } from "@/lib/token-path"
import DocMoreLink from "@/components/DocMoreLink"
import ShiftInfoList from "@/components/ShiftInfoList"
import { docHref, SECTION_DOC_LINKS } from "@/lib/help-links"
import type { MySwap, SwapOfferable, SwapShiftView, VolunteerSwapView } from "@/lib/shift-swap-view"
import {
  SWAPS_INTRO, SWAPS_MINE_TITLE, SWAPS_NEW_TERMS, SWAPS_OFFER_BUTTON, SWAPS_OFFERS_TITLE, SWAPS_PUBLISH_BUTTON, SWAPS_PUBLISH_TITLE,
  SWAPS_SECTION_ID, SWAPS_SECTION_TITLE, swapDoneText, swapMission, swapState, swapStateText, swapWhen,
} from "@/lib/shift-swap-text"

/**
 * « Échanger un créneau » (#1174) on the personal page: the person's own swap requests with
 * « Tu cèdes … / Tu reçois … », the confirmed shifts they can publish (« Je cherche à échanger ce
 * créneau »), and the requests of other people they could answer (the mission only, never a name).
 * Every action is a POST bound to the request's revision; the page loads nothing until the server
 * answered. Accepting asks first (alertdialog, « Non, garder mon créneau » focused). One action at
 * a time; the result is voiced by the card's status line, a failure by its alert, both mounted from
 * the first render; focus goes to the item's heading (or the card's) once the list is refreshed.
 * After a swap, `onShiftsChanged` reloads « Tous mes créneaux » quietly. Renders nothing while the
 * event has no swaps and the person no request.
 */

type Action = "publish" | "offer" | "confirm" | "decline" | "withdraw_offer" | "withdraw"

const REGION_ID = SWAPS_SECTION_ID
const TITLE_ID = "swaps-title"
const ENDED_ID = "swaps-ended-title"
const FALLBACK_ID = "swaps-fallback"
const itemTitleId = (requestId: string) => `swap-${requestId}-title`
const PRIMARY = "min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const SECONDARY = "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/** An answer of the swaps API, not an error body or anything else. */
function isView(v: unknown): v is VolunteerSwapView {
  const x = v as VolunteerSwapView | null
  return !!x && Array.isArray(x.mine) && Array.isArray(x.offers) && Array.isArray(x.publishable)
}

/** A name printed « Jean D. » and said « Jean, initiale D ». */
function Name({ name }: { name: string }) {
  return (
    <>
      <span aria-hidden="true">{rosterVisibleName(name)}</span>
      <span className="sr-only">{rosterSpokenName(name)}</span>
    </>
  )
}

/** One shift: mission, day and hours, then its place and important information. */
function ShiftText({ shift }: { shift: SwapShiftView }) {
  return (
    <>
      <span className="font-medium text-gray-900">{swapMission(shift)}</span>, {swapWhen(shift)}
      <ShiftInfoList info={{ locationDetails: shift.locationDetails, instructions: shift.instructions }} className="mt-1 text-xs text-gray-700" />
    </>
  )
}

/** « Tu cèdes » and « Tu reçois », stacked at every width. */
function GiveReceive({ gives, receives }: { gives: SwapShiftView; receives: SwapShiftView | null }) {
  return (
    <dl className="mt-2 space-y-2 text-sm text-gray-800">
      <div>
        <dt className="text-xs font-semibold text-gray-700">Tu cèdes</dt>
        <dd className="break-words"><ShiftText shift={gives} /></dd>
      </div>
      {receives && (
        <div>
          <dt className="text-xs font-semibold text-gray-700">Tu reçois</dt>
          <dd className="break-words"><ShiftText shift={receives} /></dd>
        </div>
      )}
    </dl>
  )
}

/** The heading of one of my requests: its state, then the shift I give (two of them stay apart). */
function ItemHeading({ m }: { m: MySwap }) {
  const other = m.otherName
  const state = swapState(m, () => "\u0000")
  const [before, after] = state.split("\u0000")
  return (
    <h4 id={itemTitleId(m.requestId)} tabIndex={-1} className="text-sm font-semibold text-gray-900 focus:outline-none">
      {other && after !== undefined ? <>{before}<Name name={other} />{after}</> : swapState(m)}
      {"\u00a0: "}{swapMission(m.gives)}, {swapWhen(m.gives)}
    </h4>
  )
}

export default function ShiftSwapsCard({ token, timeZone, onShiftsChanged, refreshKey = 0 }: {
  token: string
  timeZone: string
  onShiftsChanged: () => void
  /** Bumped by the page after a change of its registrations (a withdrawal): the card reads again. */
  refreshKey?: number
}) {
  const [view, setView] = useState<VolunteerSwapView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [choiceErrors, setChoiceErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  // The failure of an action on one request, shown under its heading (where focus goes).
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const seq = useRef(0)

  // Focus to move once React committed the render it goes with, only while focus is still in the
  // card (or was dropped by an unmounted control); `after` runs once focus is settled.
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[]; after?: () => void } | null>(null)
  useLayoutEffect(() => {
    if (!focusRequest) return
    const active = document.activeElement
    if (isFocusDropped(active) || !!document.getElementById(REGION_ID)?.contains(active)) focusFirstAvailable(focusRequest.candidates)
    focusRequest.after?.()
  }, [focusRequest])

  async function load(): Promise<VolunteerSwapView | null> {
    const n = ++seq.current
    try {
      const res = await fetch(requireTokenPath("/api/public/registrations", token) + "/swaps")
      if (!res.ok) return null
      const next = (await res.json()) as VolunteerSwapView
      if (n !== seq.current || !isView(next)) return null
      setView(next)
      return next
    } catch {
      return null
    }
  }

  useEffect(() => {
    const n = ++seq.current
    fetch(requireTokenPath("/api/public/registrations", token) + "/swaps")
      .then((r) => (r.ok ? r.json() : null))
      .then((next: VolunteerSwapView | null) => { if (isView(next) && n === seq.current) setView(next) })
      .catch(() => undefined)
  }, [token, refreshKey])

  const byId = (id: string) => () => document.getElementById(id)

  async function act(action: Action, body: Record<string, unknown>, opts: { key: string; requestId?: string; received?: SwapShiftView | null; trigger?: string }) {
    if (busy) return
    setBusy(opts.key)
    setError("")
    setItemErrors({})
    // Voiced while the request runs; replaced by the result.
    announce(setStatus, "Envoi en cours…")
    let res: Response | null = null
    let data: { ok?: boolean; requestId?: string; status?: string; error?: string; code?: string } = {}
    try {
      res = await fetch(requireTokenPath("/api/public/registrations", token) + "/swaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      })
      data = await res.json().catch(() => ({}))
    } catch {
      res = null
    }
    setBusy(null)
    setConfirming(null)
    if (!res) {
      setFocusRequest({ candidates: [opts.trigger ? byId(opts.trigger) : null, byId(TITLE_ID)], after: () => announce(setError, "La connexion a échoué : rien n'a été fait. Réessaie.") })
      return
    }
    const next = await load()
    const requestId = data.requestId ?? opts.requestId
    const liveItem = !!requestId && !!next?.mine.some((m) => m.requestId === requestId && ["open", "offered", "approval"].includes(m.status))
    const endedItem = !!requestId && !!next?.mine.some((m) => m.requestId === requestId) && !liveItem
    const candidates = [liveItem ? byId(itemTitleId(requestId!)) : null, endedItem ? byId(ENDED_ID) : null, byId(TITLE_ID), byId(FALLBACK_ID)]
    if (!res.ok) {
      // The state moved on since the page loaded (another answer, a change of the organisation):
      // the refreshed item takes focus first, then says why nothing was done, under its heading.
      const message = data.code === "revision" ? SWAPS_NEW_TERMS : data.error ?? "L'échange n'a pas pu être enregistré. Réessaie."
      setStatus("")
      setFocusRequest({ candidates, after: () => (liveItem ? announce((t) => setItemErrors({ [requestId!]: t }), message) : announce(setError, message)) })
      return
    }
    if (data.status === "applied") onShiftsChanged()
    setFocusRequest({ candidates, after: () => announce(setStatus, swapDoneText(action, data.status ?? "", opts.received)) })
  }

  function offer(o: SwapOfferable) {
    const chosen = o.registrationIds.length === 1 ? o.registrationIds[0] : choices[o.requestId]
    if (!chosen) {
      setChoiceErrors((e) => ({ ...e, [o.requestId]: "Choisis le créneau que tu cèdes." }))
      setFocusRequest({ candidates: [() => document.querySelector<HTMLInputElement>(`input[name="swap-give-${o.requestId}"]`)] })
      return
    }
    setChoiceErrors((e) => ({ ...e, [o.requestId]: "" }))
    void act("offer", { requestId: o.requestId, registrationId: chosen }, { key: `offer-${o.requestId}`, trigger: `swap-offer-${o.requestId}` })
  }

  const shown = !!view && (view.enabled || view.mine.length > 0)
  const live = view?.mine.filter((m) => ["open", "offered", "approval"].includes(m.status)) ?? []
  const ended = view?.mine.filter((m) => !["open", "offered", "approval"].includes(m.status)).slice(0, 5) ?? []
  const isBusy = busy !== null

  // One wrapper always mounted, its live regions first: a message is voiced even when the card
  // appears, empties or goes away with the action that announced it.
  return (
    <div id={REGION_ID} className="scroll-mt-4">
      <p role="status" className={status && status !== "Envoi en cours…" ? "mb-2 text-sm text-green-800" : "sr-only"}>{status}</p>
      <p role="alert" className={error ? "mb-2 text-sm text-red-800" : "sr-only"}>{error}</p>
      <span id={FALLBACK_ID} tabIndex={-1} className="sr-only focus:outline-none">{SWAPS_SECTION_TITLE}</span>
      {shown && view && (
    <section aria-labelledby={TITLE_ID} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4" data-swaps-card="1">
      <div>
        <h2 id={TITLE_ID} tabIndex={-1} className="text-sm font-semibold text-gray-900 focus:outline-none">{SWAPS_SECTION_TITLE}</h2>
        {view.enabled && <p className="mt-1 text-sm text-gray-700">{SWAPS_INTRO}</p>}
        <p className="mt-1 text-sm text-gray-700">Comment ça marche : <DocMoreLink href={docHref(SECTION_DOC_LINKS.benevole.swapShift)} about="l'échange de créneaux" /></p>
      </div>
      {isBusy && <p className="text-xs text-gray-700">Envoi en cours…</p>}

      {live.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{SWAPS_MINE_TITLE}</h3>
          <ul role="list" className="mt-2 space-y-3">
            {live.map((m) => {
              const deadlineId = `swap-${m.requestId}-deadline`
              const suffix = <span className="sr-only">, {swapMission(m.gives)}, {swapWhen(m.gives)}</span>
              const open = confirming === m.requestId
              return (
                <li key={m.requestId} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <ItemHeading m={m} />
                  <p id={`swap-${m.requestId}-error`} className={itemErrors[m.requestId] ? "mt-1 text-sm text-red-800" : "sr-only"}>{itemErrors[m.requestId] ?? ""}</p>
                  <GiveReceive gives={m.gives} receives={m.receives} />
                  <p id={deadlineId} className="mt-2 text-xs text-gray-700">{swapStateText(m, timeZone)}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {m.side === "requester" && m.status === "offered" && (
                      <>
                        <button id={`swap-accept-${m.requestId}`} type="button" className={PRIMARY} aria-describedby={itemErrors[m.requestId] ? `swap-${m.requestId}-error ${deadlineId}` : deadlineId} aria-expanded={!!m.receives && open} aria-controls={open && m.receives ? `swap-confirm-${m.requestId}` : undefined} aria-disabled={isBusy || undefined}
                          onClick={() => { if (isBusy) return; setConfirming(m.requestId); setFocusRequest({ candidates: [byId(`swap-keep-${m.requestId}`)] }) }}>
                          Accepter l&apos;échange{suffix}
                        </button>
                        <button type="button" className={SECONDARY} aria-disabled={isBusy || undefined} onClick={() => act("decline", { requestId: m.requestId, revision: m.revision }, { key: `decline-${m.requestId}`, requestId: m.requestId })}>
                          Refuser{suffix}
                        </button>
                      </>
                    )}
                    {m.side === "requester" && (
                      <button type="button" className={SECONDARY} aria-disabled={isBusy || undefined} onClick={() => act("withdraw", { requestId: m.requestId }, { key: `withdraw-${m.requestId}`, requestId: m.requestId })}>
                        Retirer ma demande{suffix}
                      </button>
                    )}
                    {m.side === "counterpart" && (
                      <button type="button" className={SECONDARY} aria-disabled={isBusy || undefined} onClick={() => act("withdraw_offer", { requestId: m.requestId, revision: m.revision }, { key: `withdraw-offer-${m.requestId}`, requestId: m.requestId })}>
                        Retirer ma proposition{suffix}
                      </button>
                    )}
                  </div>
                  {open && m.receives && (
                    <div id={`swap-confirm-${m.requestId}`} role="alertdialog" aria-labelledby={`swap-confirm-title-${m.requestId}`} aria-describedby={`swap-confirm-desc-${m.requestId}`}
                      onKeyDown={(e) => { if (e.key === "Escape" && !isBusy) { e.preventDefault(); setConfirming(null); setFocusRequest({ candidates: [byId(`swap-accept-${m.requestId}`)] }) } }}
                      className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <p id={`swap-confirm-title-${m.requestId}`} className="text-sm font-medium text-blue-950">Faire l&apos;échange ?</p>
                      <p id={`swap-confirm-desc-${m.requestId}`} className="text-sm text-blue-950">
                        Tu cèdes {swapMission(m.gives)}, {swapWhen(m.gives)}. Tu reçois {swapMission(m.receives)}, {swapWhen(m.receives)}{m.receives.locationDetails ? `, ${m.receives.locationDetails}` : ""}.
                        {m.needsApproval ? " L'organisation devra encore le valider." : " L'échange se fait tout de suite."}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" className={PRIMARY} aria-disabled={isBusy || undefined} aria-busy={busy === `confirm-${m.requestId}` || undefined}
                          onClick={() => act("confirm", { requestId: m.requestId, revision: m.revision }, { key: `confirm-${m.requestId}`, requestId: m.requestId, received: m.receives, trigger: `swap-accept-${m.requestId}` })}>
                          Oui, échanger
                        </button>
                        <button id={`swap-keep-${m.requestId}`} type="button" className={SECONDARY} aria-disabled={isBusy || undefined}
                          onClick={() => { if (isBusy) return; setConfirming(null); setFocusRequest({ candidates: [byId(`swap-accept-${m.requestId}`)] }) }}>
                          Non, garder mon créneau
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {view.enabled && view.publishable.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{SWAPS_PUBLISH_TITLE}</h3>
          <ul role="list" className="mt-2 space-y-2">
            {view.publishable.map((p) => {
              const shift = p.shift
              return (
                <li key={p.registrationId} className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 break-words text-sm text-gray-800"><span className="font-medium text-gray-900">{swapMission(shift)}</span>, {swapWhen(shift)}</p>
                  <button type="button" className={`${SECONDARY} sm:shrink-0`} aria-disabled={isBusy || undefined}
                    onClick={() => act("publish", { registrationId: p.registrationId }, { key: `publish-${p.registrationId}` })}>
                    {SWAPS_PUBLISH_BUTTON}<span className="sr-only">, {swapMission(shift)}, {swapWhen(shift)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {view.enabled && view.offers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{SWAPS_OFFERS_TITLE}</h3>
          <ul role="list" className="mt-2 space-y-3">
            {view.offers.map((o) => {
              const single = o.registrationIds.length === 1 ? o.registrationIds[0] : null
              const chosen = single ?? choices[o.requestId]
              const giving = chosen ? view.ownShifts[chosen] : null
              const commitId = `swap-commit-${o.requestId}`
              const errorId = `swap-choice-error-${o.requestId}`
              return (
                <li key={o.requestId} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <h4 className="text-sm font-semibold text-gray-900">Quelqu&apos;un cède : {swapMission(o.shift)}, {swapWhen(o.shift)}<span className="sr-only">, réponse avant le {deadlineMoment(new Date(o.deadline), timeZone)}</span></h4>
                  <ShiftInfoList info={{ locationDetails: o.shift.locationDetails, instructions: o.shift.instructions }} className="mt-1 text-xs text-gray-700" />
                  {single ? (
                    <p className="mt-2 text-sm text-gray-800">Tu cèdes : {giving ? <><span className="font-medium">{swapMission(giving)}</span>, {swapWhen(giving)}</> : "un de tes créneaux"}</p>
                  ) : (
                    <fieldset className="mt-2" aria-describedby={choiceErrors[o.requestId] ? errorId : undefined}>
                      <legend className="text-sm font-medium text-gray-800">Tu cèdes :</legend>
                      {o.registrationIds.map((id) => {
                        const s = view.ownShifts[id]
                        return (
                          <label key={id} className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-gray-800 hover:bg-white">
                            <input type="radio" name={`swap-give-${o.requestId}`} value={id} required checked={choices[o.requestId] === id} className="h-5 w-5"
                              onChange={() => { setChoices((c) => ({ ...c, [o.requestId]: id })); setChoiceErrors((e) => ({ ...e, [o.requestId]: "" })) }} />
                            <span className="min-w-0 break-words">{s ? <><span className="font-medium">{swapMission(s)}</span>, {swapWhen(s)}</> : "un de tes créneaux"}</span>
                          </label>
                        )
                      })}
                      <p id={errorId} className={choiceErrors[o.requestId] ? "mt-1 text-sm text-red-800" : "sr-only"}>{choiceErrors[o.requestId] ?? ""}</p>
                    </fieldset>
                  )}
                  <p id={commitId} className="mt-2 text-xs text-gray-700">
                    Si la personne accepte avant le {deadlineMoment(new Date(o.deadline), timeZone)}, l&apos;échange se fait : tu reçois ce créneau à la place du tien.
                  </p>
                  <button id={`swap-offer-${o.requestId}`} type="button" className={`${PRIMARY} mt-2`} aria-describedby={commitId} aria-disabled={isBusy || undefined} onClick={() => offer(o)}>
                    {SWAPS_OFFER_BUTTON}<span className="sr-only">, {swapMission(o.shift)}, {swapWhen(o.shift)}, réponse avant le {deadlineMoment(new Date(o.deadline), timeZone)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {ended.length > 0 && (
        <div>
          <h3 id={ENDED_ID} tabIndex={-1} className="text-sm font-semibold text-gray-900 focus:outline-none">Échanges terminés</h3>
          <ul role="list" className="mt-2 space-y-1 text-sm text-gray-800">
            {ended.map((m) => (
              <li key={m.requestId} className="break-words">
                <span className="font-medium">{swapState(m)}</span> : {swapMission(m.gives)}, {swapWhen(m.gives)}. {m.status === "applied" ? (m.receives ? `Tu reçois ${swapMission(m.receives)}, ${swapWhen(m.receives)}.` : "") : swapStateText(m, timeZone)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
      )}
    </div>
  )
}
