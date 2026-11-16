"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useId } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getRoleAccent } from "@/lib/roles"
import { fmt, clamp } from "@/lib/gantt-utils"
import { ROW_H } from "@/lib/day-timeline"
import { moveProblem } from "@/lib/shift-quick-edit"
import { normalizeTime } from "@/lib/shifts-admin"
import { minVolunteersProblem, parseMinVolunteers } from "@/lib/staffing"
import { closingPatch, linkPlan } from "@/lib/shift-popover-edits"
import { spokenTimeRange } from "@/lib/spoken-time"
import { popoverPlacement } from "@/lib/popover-placement"
import { focusLeftContainer } from "@/lib/focus-leave"
import { isFocusDropped } from "@/lib/focus-return"
import { applyResultMessage, applySummary, confirmQuestion, labelToApply, type ApplyResult, type ApplyScope, type ApplyValues } from "@/lib/poste-apply"
import type { AdminShift } from "../AdminDayTimeline"

/**
 * Quick edits of one shift from the timeline (#398): label, capacity and minimum (#949, for this
 * shift, or with the label onto the poste's shifts of this day or of the whole event, #1017), times,
 * status, duplicate, delete. Closing (click outside, Escape, ✕)
 * saves the label, capacity and minimum, and so does « Voir les inscriptions » before it leaves the
 * page (#991); the other actions save on their own button.
 */
export default function ShiftPopover({
  shift, anchor, eventId, eventCount, onClose, onPatch, onDelete, onCancelShift, onDuplicate, onApplyToPoste, onNotSaved,
}: {
  shift:    AdminShift
  anchor:   { x: number; y: number; w: number }
  eventId:  string
  /** The poste's live shifts over the whole event (#1017), or null when it has shifts on this day only. */
  eventCount?: { shifts: number; days: number } | null
  onClose:  () => void
  /** Resolves to `false` when the change was not saved (the parent says why). */
  onPatch:  (id: string, data: Partial<AdminShift>) => Promise<boolean | void> | boolean | void
  onDelete: (id: string) => void
  /**
   * « Créneau annulé » chosen on a shift with people registered (AUTHZ-15): the parent closes the
   * popover and asks first. Without it, or with nobody registered, the status saves at once.
   */
  onCancelShift?: (id: string) => void
  onDuplicate: (id: string) => Promise<void> | void
  /**
   * « Appliquer au poste » (#1017): `minVolunteers` null removes it, absent leaves each shift's own
   * (#949); `label` absent leaves each shift's own. Resolves to `false` when nothing was applied
   * (the parent says why).
   */
  onApplyToPoste: (shiftId: string, roleName: string, scope: ApplyScope, values: ApplyValues) => Promise<ApplyResult | false>
  /** Said out loud by the parent once the popover is closed (#949): what closing did not save, and why. */
  onNotSaved?: (message: string) => void
}) {
  const id = useId()
  const router = useRouter()
  const [label, setLabel]       = useState(shift.label === shift.roleName ? "" : shift.label)
  // The label as it was at opening (#1017): only a label typed here is copied to the poste.
  const [openingLabel] = useState(label)
  const [capacity, setCapacity] = useState(shift.capacity)
  // Minimum of people (#949), as typed: "" is none.
  const [minimum, setMinimum]   = useState<string>(shift.minVolunteers != null ? String(shift.minVolunteers) : "")
  const [status, setStatus]     = useState(shift.status)
  const [startTime, setStartTime] = useState(shift.startTime)
  const [endTime, setEndTime]     = useState(shift.endTime)
  const [busy, setBusy] = useState<"move" | "duplicate" | "apply-day" | "apply-event" | "navigate" | null>(null)
  // « Tout l'événement » asks first (#1017); focus then goes to the control the step shows.
  const [confirming, setConfirming] = useState(false)
  const focusNextRef = useRef<"confirm" | "event" | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const eventButtonRef = useRef<HTMLButtonElement>(null)
  // After the render that shows the step, before paint: focus never rests on <body>.
  useLayoutEffect(() => {
    const target = focusNextRef.current
    if (!target) return
    focusNextRef.current = null
    ;(target === "confirm" ? confirmRef : eventButtonRef).current?.focus()
  })
  const [message, setMessageState] = useState<string | null>(null)
  // Once shown, the status box keeps its place: re-announcing does not make the popover jump.
  const [statusShown, setStatusShown] = useState(false)
  const announce = (text: string) => { setStatusShown(true); setMessageState(null); requestAnimationFrame(() => setMessageState(text)) }
  const ref = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // Natural height of the popover (content plus its frame), measured before paint and on every
  // content change, to choose the side of the bar.
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const measure = () => {
      const outer = ref.current
      const frame = outer ? outer.offsetHeight - outer.clientHeight : 0
      const h = content.offsetHeight
      if (h) setContentHeight(h + Math.max(frame, 0))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  // Placed again when the window is resized or zoomed, or the page or the timeline scrolls.
  const [, setViewportTick] = useState(0)
  useEffect(() => {
    const update = () => setViewportTick(t => t + 1)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    window.visualViewport?.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
      window.visualViewport?.removeEventListener("resize", update)
    }
  }, [])
  // The bar that opened the popover: focus goes back to it on close.
  const openerRef = useRef<HTMLElement | null>(null)

  // Sync latest values into refs so closeAndSave closure stays stable
  const labelRef    = useRef(label)
  const capacityRef = useRef(capacity)
  const minimumRef  = useRef(minimum)
  useEffect(() => { labelRef.current = label },    [label])
  useEffect(() => { capacityRef.current = capacity }, [capacity])
  useEffect(() => { minimumRef.current = minimum }, [minimum])
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    headingRef.current?.focus()
  }, [])

  const minCapacity = Math.max(shift.registrationCount, 1)
  const capacityTooLow = capacity < minCapacity
  // The minimum against the places typed (#949): an invalid pair saves neither.
  const minimumValue = parseMinVolunteers(minimum)
  const minimumError = minVolunteersProblem(minimumValue, capacity)

  const closedRef = useRef(false)
  // Focus goes back to the bar unless it already moved elsewhere (Tab out, click on another control).
  const closeAndSave = useCallback((restoreFocus = true) => {
    if (closedRef.current) return
    closedRef.current = true
    // A capacity under the confirmed people isn't saved, and a minimum that doesn't fit the places
    // (#949) saves neither: the shift keeps its own.
    const { patch, pairProblem } = closingPatch(shift, { label: labelRef.current, capacity: capacityRef.current, minimum: minimumRef.current })
    // Once saved, the page's copy in the router cache is refreshed: Back from another page would
    // show the old values (#1004). Client state, focus and scroll are kept.
    void Promise.resolve(onPatch(shift.id, patch)).then(saved => { if (saved !== false) router.refresh() })
    onClose()
    // The bar itself when what was focused at opening is gone (the bar is drawn again when a
    // duplicate adds a lane), was no control (WebKit, #987), or is the popover's own heading (the
    // opening effect run twice in development).
    const recorded = openerRef.current
    const usable = recorded?.isConnected && !isFocusDropped(recorded) && !ref.current?.contains(recorded)
    const opener = usable ? recorded : document.getElementById(`shift-bar-${shift.id}`)
    if (restoreFocus && opener?.isConnected) opener.focus()
    // The field's message is gone with the popover: the discarded pair is announced (3.3.1, 4.1.3).
    if (pairProblem) onNotSaved?.(`Places et minimum non enregistrés : ${pairProblem}`)
  }, [shift, onPatch, onClose, onNotSaved, router])

  useEffect(() => {
    function onMD(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeAndSave()
    }
    document.addEventListener("mousedown", onMD)
    return () => document.removeEventListener("mousedown", onMD)
  }, [closeAndSave])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Focus inside, or dropped on an ancestor after a tap (WebKit, #987): back to the bar.
      if (e.key === "Escape") closeAndSave(!focusLeftContainer(ref.current, document.activeElement))
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [closeAndSave])

  const moved = startTime !== shift.startTime || endTime !== shift.endTime
  const moveError = moved ? moveProblem(startTime, endTime) : null

  async function saveMove() {
    if (!moved || moveError || busy) return
    setBusy("move")
    await onPatch(shift.id, { startTime, endTime })
    setBusy(null)
    announce(shift.registrationCount > 0 ? "Horaires enregistrés, les inscrits sont prévenus." : "Horaires enregistrés.")
  }

  async function duplicate() {
    if (busy) return
    setBusy("duplicate")
    await onDuplicate(shift.id)
    setBusy(null)
    announce("Créneau dupliqué juste après celui-ci.")
  }

  // What « Appliquer au poste » copies (#1017). The minimum goes with the places when there is one,
  // or when this shift's is being removed; an empty field on a shift without one leaves each shift's
  // own. The label goes only when typed here and not empty.
  const applyLabel = labelToApply(label, openingLabel, shift.roleName)
  const applyMinimum = minimumValue != null || shift.minVolunteers != null ? minimumValue : undefined
  const applyValues: ApplyValues = {
    capacity,
    ...(applyMinimum !== undefined ? { minVolunteers: applyMinimum } : {}),
    ...(applyLabel !== undefined ? { label: applyLabel } : {}),
  }
  const applyBlocked = capacityTooLow || !!minimumError

  async function applyToPoste(scope: ApplyScope) {
    if (busy || applyBlocked) return
    setBusy(scope === "day" ? "apply-day" : "apply-event")
    const result = await onApplyToPoste(shift.id, shift.roleName, scope, applyValues)
    setBusy(null)
    // On failure the parent says why; focus stays where it is (on « Confirmer » for the event).
    if (result === false) return
    if (scope === "event") { focusNextRef.current = "event"; setConfirming(false) }
    announce(applyResultMessage(shift.roleName, scope, result))
  }

  function cancelConfirm() {
    if (busy) return
    focusNextRef.current = "event"
    setConfirming(false)
  }

  // An unavailable button says why (3.3.1); else what it applies.
  const applyDescribedBy = applyBlocked
    ? [minimumError && `${id}-minimum-hint`, capacityTooLow && `${id}-capacity-hint`].filter(Boolean).join(" ")
    : `${id}-apply-hint`
  const registrationsHref = `/admin/events/${eventId}/registrations?shift=${shift.id}`
  const capacityInputRef = useRef<HTMLInputElement>(null)
  const minimumInputRef = useRef<HTMLInputElement>(null)

  // « Voir les inscriptions » (#991): what closing saves is saved first, and the page is left only
  // once it is. Called by Next for an in-app navigation only: a new tab or window keeps the popover
  // and its edits. Next reads preventDefault() synchronously, before any await.
  function followRegistrations(e: { preventDefault(): void }) {
    if (busy || closedRef.current) { e.preventDefault(); return }
    const plan = linkPlan(shift, { label, capacity, minimum })
    if (plan.kind === "follow") { onClose(); return }
    e.preventDefault()
    if (plan.kind === "fix") {
      // The field says why through its description; focused now, within the tap (iOS keyboard).
      ;(plan.field === "capacity" ? capacityInputRef : minimumInputRef).current?.focus()
      return
    }
    // Closing is under way: a click outside, Escape or focus leaving does not save a second time.
    closedRef.current = true
    setBusy("navigate")
    void (async () => {
      const saved = await onPatch(shift.id, plan.patch)
      if (saved === false) {
        // The parent shows and announces the error; the popover stays, focus on the link.
        closedRef.current = false
        setBusy(null)
        return
      }
      onClose()
      // The page's copy in the router cache still has the old values: Back would show them.
      router.refresh()
      router.push(registrationsHref)
    })()
  }

  // The bar as it is now (after a scroll or a resize), else where it was when the popover opened.
  const bar = document.getElementById(`shift-bar-${shift.id}`)?.getBoundingClientRect()
  const barTop = bar ? bar.top : anchor.y
  const barBottom = bar ? bar.bottom : anchor.y + ROW_H
  const barLeft = bar ? bar.left : anchor.x
  const barWidth = bar ? bar.width : anchor.w
  const POPW = Math.min(280, window.innerWidth - 16)
  const left = clamp(barLeft + barWidth / 2 - POPW / 2, 8, window.innerWidth - POPW - 8)
  // Below the bar, or above it when it is low on the screen; always inside the viewport.
  const { top, maxHeight } = popoverPlacement({ anchorTop: barTop, anchorBottom: barBottom, viewportHeight: window.innerHeight, contentHeight })
  const field = "w-full text-sm border border-gray-500 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
  const action = "text-sm font-medium rounded-lg px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 overflow-y-auto"
      style={{ left, top, width: POPW, maxHeight }}
      onMouseDown={e => e.stopPropagation()}
      onBlur={e => {
        // Focus left the popover for another control of the page: close and save, without pulling
        // focus back. A null target (window switch) keeps it open, and so does an ancestor such as
        // <main tabIndex={-1}>: where WebKit drops focus on a tap of a button it does not focus
        // (#987), which closed the popover before the tap's click.
        if (focusLeftContainer(ref.current, e.relatedTarget as Node | null)) closeAndSave(false)
      }}
      onClickCapture={e => {
        // The tapped control takes focus itself (WebKit does not give it, #987), before its own
        // handler moves it: Tab then goes on from there, not from the top of the page.
        const control = (e.target as Element).closest?.("button, a, select, input")
        if (control instanceof HTMLElement && ref.current?.contains(control) && !ref.current.contains(document.activeElement)) control.focus()
      }}
    >
      <div ref={contentRef} data-popover-content="" className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          {/* The whole role name wraps rather than being cut (#606); the times are read in words (#587). */}
          <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="flex items-center gap-1.5 min-w-0 focus:outline-none">
            <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 ${getRoleAccent(shift.roleName, shift.colorKey)}`} />
            <span className="text-sm font-semibold text-gray-800 min-w-0 [overflow-wrap:anywhere]">{shift.roleName}</span>
            <span className="sr-only">, {spokenTimeRange(shift.startTime, shift.endTime)}</span>
            <span aria-hidden="true" className="text-xs text-gray-600 flex-shrink-0">{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
          </h3>
          <button type="button" onClick={() => closeAndSave()} aria-label="Fermer et enregistrer" aria-disabled={busy === "navigate" ? true : undefined} className="text-gray-600 hover:text-gray-900 flex-shrink-0 rounded p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div role="status" aria-live="polite" className={statusShown ? "min-h-6 text-xs text-green-800 bg-green-50 rounded-lg px-2 py-1" : "sr-only"}>{message}</div>

        <div>
          <label htmlFor={`${id}-label`} className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
          <input id={`${id}-label`} type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={shift.roleName} aria-describedby={`${id}-label-hint`} className={field} />
          <p id={`${id}-label-hint`} className="text-xs text-gray-600 mt-0.5">Laisser vide si identique au poste. Libellé et places sont enregistrés à la fermeture (Échap ou « Fermer et enregistrer »).</p>
        </div>

        <div className="flex items-end gap-2">
          <div className="w-20">
            <label htmlFor={`${id}-capacity`} className="block text-xs font-medium text-gray-700 mb-1">Places</label>
            <input ref={capacityInputRef} id={`${id}-capacity`} type="number" min={minCapacity} value={capacity} aria-invalid={capacityTooLow ? true : undefined} aria-describedby={[capacityTooLow && `${id}-capacity-hint`, minimumError && `${id}-minimum-hint`].filter(Boolean).join(" ") || undefined} onChange={e => setCapacity(Number(e.target.value))} className={`${field} text-center`} />
          </div>
          <div className="w-24">
            <label htmlFor={`${id}-minimum`} className="block text-xs font-medium text-gray-700 mb-1">Minimum</label>
            <input ref={minimumInputRef} id={`${id}-minimum`} type="number" min={1} max={capacity} inputMode="numeric" value={minimum} placeholder="Aucun" aria-invalid={minimumError ? true : undefined} aria-describedby={`${id}-minimum-hint`} onChange={e => setMinimum(e.target.value)} className={`${field} text-center ${minimumError ? "!border-red-600" : ""}`} />
          </div>
        </div>
        <p id={`${id}-minimum-hint`} className={`text-xs -mt-2 ${minimumError ? "text-red-700" : "text-gray-600"}`}>
          {minimumError ? `${minimumError} Non enregistré.` : "Facultatif : sous ce nombre de personnes, le créneau ne peut pas tourner. Vide : toutes les places."}
        </p>
        {capacityTooLow && (
          <p id={`${id}-capacity-hint`} className="text-xs -mt-2 text-red-700">
            {`Au moins ${minCapacity} : ${shift.registrationCount} personne${shift.registrationCount > 1 ? "s sont déjà inscrites" : " est déjà inscrite"}. Non enregistré en dessous.`}
          </p>
        )}
        <div>
          {eventCount ? (
            <>
              <p id={`${id}-apply-label`} className="text-xs font-medium text-gray-700 mb-1">Appliquer au poste « {shift.roleName} » :</p>
              {confirming ? (
                <div
                  role="group"
                  aria-labelledby={`${id}-confirm-question`}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-2 space-y-2"
                  onKeyDown={e => {
                    // Escape leaves the question, not the popover.
                    if (e.key === "Escape") { e.stopPropagation(); cancelConfirm() }
                  }}
                >
                  <p id={`${id}-confirm-question`} className="text-sm text-gray-800">{confirmQuestion(eventCount)}</p>
                  <div className="flex gap-2">
                    <button
                      ref={confirmRef}
                      type="button"
                      onClick={() => void applyToPoste("event")}
                      // A held Enter on « Tout l'événement » must not confirm at once.
                      onKeyDown={e => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault() }}
                      aria-disabled={busy !== null || applyBlocked}
                      aria-describedby={applyDescribedBy}
                      className={`text-xs font-medium rounded-lg px-3 py-1.5 bg-blue-700 text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy || applyBlocked ? "opacity-50" : ""}`}
                    >
                      {busy === "apply-event" ? "Application…" : "Confirmer"}
                    </button>
                    <button type="button" onClick={cancelConfirm} aria-disabled={busy !== null} className={`${action} text-xs px-3 text-gray-800 hover:bg-gray-100 ${busy ? "opacity-50" : ""}`}>
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div role="group" aria-labelledby={`${id}-apply-label`} className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => void applyToPoste("day")} aria-disabled={busy !== null || applyBlocked} aria-describedby={applyDescribedBy} className={`${action} px-3 border border-blue-200 text-blue-700 hover:bg-blue-50 ${busy || applyBlocked ? "opacity-50" : ""}`}>
                    {busy === "apply-day" ? "Application…" : "Ce jour"}
                  </button>
                  <button
                    ref={eventButtonRef}
                    type="button"
                    onClick={() => { if (!busy && !applyBlocked) { focusNextRef.current = "confirm"; setConfirming(true) } }}
                    aria-disabled={busy !== null || applyBlocked}
                    aria-describedby={applyDescribedBy}
                    className={`${action} px-3 border border-blue-200 text-blue-700 hover:bg-blue-50 ${busy || applyBlocked ? "opacity-50" : ""}`}
                  >
                    Tout l&apos;événement
                  </button>
                </div>
              )}
            </>
          ) : (
            <button type="button" onClick={() => void applyToPoste("day")} aria-disabled={busy !== null || applyBlocked} aria-describedby={applyDescribedBy} className={`${action} text-blue-700 hover:bg-blue-50 ${busy || applyBlocked ? "opacity-50" : ""}`}>
              {busy === "apply-day" ? "Application…" : "Appliquer à tout le poste"}
            </button>
          )}
          <p id={`${id}-apply-hint`} className="text-xs mt-1 text-gray-600">
            {busy === "apply-day" || busy === "apply-event"
              ? "Enregistrement en cours…"
              : applyBlocked ? "Corrigez les places ou le minimum pour appliquer au poste." : applySummary(applyValues)}
          </p>
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-gray-700 mb-1">Horaires</legend>
          <div className="flex items-end gap-2">
            <div className="w-20">
              <label htmlFor={`${id}-start`} className="block text-xs text-gray-600 mb-1">Début</label>
              <input id={`${id}-start`} type="text" inputMode="numeric" value={startTime} onChange={e => setStartTime(e.target.value)} onBlur={e => setStartTime(normalizeTime(e.target.value))} aria-invalid={moveError ? true : undefined} aria-describedby={`${id}-move-hint`} className={field} />
            </div>
            <div className="w-20">
              <label htmlFor={`${id}-end`} className="block text-xs text-gray-600 mb-1">Fin</label>
              <input id={`${id}-end`} type="text" inputMode="numeric" value={endTime} onChange={e => setEndTime(e.target.value)} onBlur={e => setEndTime(normalizeTime(e.target.value))} aria-invalid={moveError ? true : undefined} aria-describedby={`${id}-move-hint`} className={field} />
            </div>
            <button type="button" onClick={saveMove} aria-disabled={!moved || !!moveError || busy !== null} aria-describedby={`${id}-move-hint`} className={`${action} text-blue-700 hover:bg-blue-50 ${!moved || moveError || busy ? "opacity-50" : ""}`}>
              {busy === "move" ? "Décalage…" : "Décaler"}
            </button>
          </div>
          <p id={`${id}-move-hint`} className={`text-xs mt-1 ${moveError ? "text-red-700" : "text-gray-600"}`}>
            {moveError ?? (!moved ? "Modifiez le début ou la fin, puis Décaler." : shift.registrationCount > 0 ? "Les inscrits recevront un email si les horaires changent." : "HH:MM ; une fin plus petite que le début passe minuit.")}
          </p>
        </fieldset>

        <div>
          <label htmlFor={`${id}-status`} className="block text-xs font-medium text-gray-700 mb-1">Inscriptions</label>
          <select
            id={`${id}-status`}
            value={status}
            aria-disabled={busy !== null ? true : undefined}
            aria-describedby={shift.registrationCount > 0 && onCancelShift ? `${id}-status-hint` : undefined}
            onChange={e => {
              if (busy) return
              // People registered: nothing is saved before the confirmation, so nothing to revert.
              if (e.target.value === "cancelled" && shift.registrationCount > 0 && onCancelShift) { onCancelShift(shift.id); return }
              setStatus(e.target.value)
              onPatch(shift.id, { status: e.target.value })
              announce(e.target.value === "closed" ? "Inscriptions fermées." : e.target.value === "open" ? "Inscriptions rouvertes." : e.target.value === "cancelled" ? "Créneau annulé." : "Statut enregistré.")
            }}
            className={`${field} ${busy ? "opacity-50" : ""}`}
          >
            <option value="open">Ouvertes</option>
            <option value="full">Complet</option>
            <option value="closed">Fermées</option>
            <option value="cancelled">Créneau annulé</option>
          </select>
          {shift.registrationCount > 0 && onCancelShift && (
            <p id={`${id}-status-hint`} className="text-xs text-gray-600 mt-1">Créneau annulé{"\u00a0"}: une confirmation sera demandée.</p>
          )}
        </div>

        {shift.registrationCount > 0 && (
          <p className="text-xs text-orange-800">
            {shift.registrationCount} inscription{shift.registrationCount > 1 ? "s" : ""} existante{shift.registrationCount > 1 ? "s" : ""}
          </p>
        )}

        <div className="grid grid-cols-2 gap-1 pt-1 border-t border-gray-100">
          <button type="button" onClick={duplicate} aria-disabled={busy !== null} className={`${action} text-gray-800 hover:bg-gray-50 ${busy ? "opacity-50" : ""}`}>
            {busy === "duplicate" ? "Duplication…" : "Dupliquer"}
          </button>
          <Link
            href={registrationsHref}
            aria-disabled={busy !== null ? true : undefined}
            className={`${action} text-center text-blue-700 hover:bg-blue-50 ${busy ? "opacity-50" : ""}`}
            onNavigate={followRegistrations}
          >
            {busy === "navigate" ? "Enregistrement…" : "Voir les inscriptions"}
          </Link>
          <button
            type="button"
            onClick={() => { if (!busy) onDelete(shift.id) }}
            aria-disabled={busy !== null}
            className={`${action} col-span-2 text-red-700 hover:bg-red-50 ${busy ? "opacity-50" : ""}`}
          >
            Supprimer le créneau
          </button>
        </div>
      </div>
    </div>
  )
}
