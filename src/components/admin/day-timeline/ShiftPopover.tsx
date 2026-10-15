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
import type { AdminShift } from "../AdminDayTimeline"

/**
 * Quick edits of one shift from the timeline (#398): label, capacity and minimum (#949, for this
 * shift or the whole role), times, status, duplicate, delete. Closing (click outside, Escape, ✕)
 * saves the label, capacity and minimum, and so does « Voir les inscriptions » before it leaves the
 * page (#991); the other actions save on their own button.
 */
export default function ShiftPopover({
  shift, anchor, eventId, onClose, onPatch, onDelete, onDuplicate, onApplyCapacity, onNotSaved,
}: {
  shift:    AdminShift
  anchor:   { x: number; y: number; w: number }
  eventId:  string
  onClose:  () => void
  /** Resolves to `false` when the change was not saved (the parent says why). */
  onPatch:  (id: string, data: Partial<AdminShift>) => Promise<boolean | void> | boolean | void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => Promise<void> | void
  /** `minVolunteers` (#949): null removes it on the role, absent leaves each shift's own. */
  onApplyCapacity: (roleName: string, capacity: number, minVolunteers?: number | null) => Promise<boolean | void> | boolean | void
  /** Said out loud by the parent once the popover is closed (#949): what closing did not save, and why. */
  onNotSaved?: (message: string) => void
}) {
  const id = useId()
  const router = useRouter()
  const [label, setLabel]       = useState(shift.label === shift.roleName ? "" : shift.label)
  const [capacity, setCapacity] = useState(shift.capacity)
  // Minimum of people (#949), as typed: "" is none.
  const [minimum, setMinimum]   = useState<string>(shift.minVolunteers != null ? String(shift.minVolunteers) : "")
  const [status, setStatus]     = useState(shift.status)
  const [startTime, setStartTime] = useState(shift.startTime)
  const [endTime, setEndTime]     = useState(shift.endTime)
  const [busy, setBusy] = useState<"move" | "duplicate" | "capacity" | "navigate" | null>(null)
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
    onPatch(shift.id, patch)
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
  }, [shift, onPatch, onClose, onNotSaved])

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

  async function applyCapacity() {
    if (busy || capacityTooLow || minimumError) return
    setBusy("capacity")
    // The minimum goes with the places when there is one, or when this shift's is being removed;
    // an empty field on a shift without one leaves each shift's own minimum as it is.
    const ok = minimumValue != null || shift.minVolunteers != null
      ? await onApplyCapacity(shift.roleName, capacity, minimumValue)
      : await onApplyCapacity(shift.roleName, capacity)
    setBusy(null)
    if (ok === false) return
    announce(minimumValue != null
      ? `${capacity} places et un minimum de ${minimumValue} appliqués au poste « ${shift.roleName} ».`
      : `Capacité de ${capacity} appliquée au poste « ${shift.roleName} ».`)
  }

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
  const field = "w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
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
            <input ref={capacityInputRef} id={`${id}-capacity`} type="number" min={minCapacity} value={capacity} aria-invalid={capacityTooLow ? true : undefined} aria-describedby={minimumError ? `${id}-capacity-hint ${id}-minimum-hint` : `${id}-capacity-hint`} onChange={e => setCapacity(Number(e.target.value))} className={`${field} text-center`} />
          </div>
          <div className="w-24">
            <label htmlFor={`${id}-minimum`} className="block text-xs font-medium text-gray-700 mb-1">Minimum</label>
            <input ref={minimumInputRef} id={`${id}-minimum`} type="number" min={1} max={capacity} inputMode="numeric" value={minimum} placeholder="Aucun" aria-invalid={minimumError ? true : undefined} aria-describedby={`${id}-minimum-hint`} onChange={e => setMinimum(e.target.value)} className={`${field} text-center ${minimumError ? "!border-red-600" : ""}`} />
          </div>
        </div>
        <p id={`${id}-minimum-hint`} className={`text-xs -mt-2 ${minimumError ? "text-red-700" : "text-gray-600"}`}>
          {minimumError ? `${minimumError} Non enregistré.` : "Facultatif : sous ce nombre de personnes, le créneau ne peut pas tourner. Vide : toutes les places."}
        </p>
        <div>
          <button type="button" onClick={applyCapacity} aria-disabled={busy !== null || capacityTooLow || !!minimumError} aria-describedby={minimumError ? `${id}-minimum-hint ${id}-capacity-hint` : `${id}-capacity-hint`} className={`${action} text-blue-700 hover:bg-blue-50 ${busy || capacityTooLow || minimumError ? "opacity-50" : ""}`}>
            {busy === "capacity" ? "Application…" : "Appliquer à tout le poste"}
          </button>
          <p id={`${id}-capacity-hint`} className={`text-xs mt-1 ${capacityTooLow ? "text-red-700" : "text-gray-600"}`}>
            {capacityTooLow
              ? `Au moins ${minCapacity} : ${shift.registrationCount} personne${shift.registrationCount > 1 ? "s sont déjà inscrites" : " est déjà inscrite"}. Non enregistré en dessous.`
              : busy === "capacity" ? "Enregistrement en cours…" : "Places et minimum sur tout le poste, jamais en dessous des inscrits d'un créneau."}
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
            onChange={e => {
              if (busy) return
              setStatus(e.target.value)
              onPatch(shift.id, { status: e.target.value })
              announce(e.target.value === "closed" ? "Inscriptions fermées." : e.target.value === "open" ? "Inscriptions rouvertes." : "Statut enregistré.")
            }}
            className={`${field} ${busy ? "opacity-50" : ""}`}
          >
            <option value="open">Ouvertes</option>
            <option value="full">Complet</option>
            <option value="closed">Fermées</option>
            <option value="cancelled">Créneau annulé</option>
          </select>
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
