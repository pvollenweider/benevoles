"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef, useCallback, useEffect, useId } from "react"
import Link from "next/link"
import { getRoleAccent } from "@/lib/roles"
import { fmt, clamp } from "@/lib/gantt-utils"
import { ROW_H } from "@/lib/day-timeline"
import { moveProblem } from "@/lib/shift-quick-edit"
import { normalizeTime } from "@/lib/shifts-admin"
import type { AdminShift } from "../AdminDayTimeline"

/**
 * Quick edits of one shift from the timeline (#398): label, capacity (for this shift or the
 * whole role), times, status, duplicate, delete. Closing (click outside, Escape, ✕) saves the
 * label and capacity; the other actions save on their own button.
 */
export default function ShiftPopover({
  shift, anchor, eventId, onClose, onPatch, onDelete, onDuplicate, onApplyCapacity,
}: {
  shift:    AdminShift
  anchor:   { x: number; y: number; w: number }
  eventId:  string
  onClose:  () => void
  onPatch:  (id: string, data: Partial<AdminShift>) => Promise<void> | void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => Promise<void> | void
  onApplyCapacity: (roleName: string, capacity: number) => Promise<void> | void
}) {
  const id = useId()
  const [label, setLabel]       = useState(shift.label === shift.roleName ? "" : shift.label)
  const [capacity, setCapacity] = useState(shift.capacity)
  const [status, setStatus]     = useState(shift.status)
  const [startTime, setStartTime] = useState(shift.startTime)
  const [endTime, setEndTime]     = useState(shift.endTime)
  const [busy, setBusy] = useState<"move" | "duplicate" | "capacity" | null>(null)
  const [message, setMessageState] = useState<string | null>(null)
  const announce = (text: string) => { setMessageState(null); requestAnimationFrame(() => setMessageState(text)) }
  const ref = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The bar that opened the popover: focus goes back to it on close.
  const openerRef = useRef<HTMLElement | null>(null)

  // Sync latest values into refs so closeAndSave closure stays stable
  const labelRef    = useRef(label)
  const capacityRef = useRef(capacity)
  useEffect(() => { labelRef.current = label },    [label])
  useEffect(() => { capacityRef.current = capacity }, [capacity])
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    headingRef.current?.focus()
  }, [])

  const minCapacity = Math.max(shift.registrationCount, 1)
  const capacityTooLow = capacity < minCapacity

  const closeAndSave = useCallback(() => {
    const capacity = capacityRef.current
    onPatch(shift.id, {
      label: labelRef.current.trim() || shift.roleName,
      // A capacity under the confirmed people isn't saved: the shift keeps its current one.
      ...(capacity >= Math.max(shift.registrationCount, 1) ? { capacity } : {}),
    })
    onClose()
    const opener = openerRef.current
    if (opener?.isConnected) opener.focus()
  }, [shift.id, shift.roleName, shift.registrationCount, onPatch, onClose])

  useEffect(() => {
    function onMD(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeAndSave()
    }
    document.addEventListener("mousedown", onMD)
    return () => document.removeEventListener("mousedown", onMD)
  }, [closeAndSave])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeAndSave() }
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
    if (busy || capacityTooLow) return
    setBusy("capacity")
    await onApplyCapacity(shift.roleName, capacity)
    setBusy(null)
    announce(`Capacité de ${capacity} appliquée au poste « ${shift.roleName} ».`)
  }

  const POPW = 280
  const left = clamp(anchor.x + anchor.w / 2 - POPW / 2, 8, window.innerWidth - POPW - 8)
  const top  = anchor.y + ROW_H + 6
  const field = "w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const action = "text-sm font-medium rounded-lg px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={`${id}-title`}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 space-y-3 overflow-y-auto"
      style={{ left, top, width: POPW, maxHeight: Math.max(window.innerHeight - top - 8, 160) }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="flex items-center gap-1.5 min-w-0 focus:outline-none">
          <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 ${getRoleAccent(shift.roleName, shift.colorKey)}`} />
          <span className="text-sm font-semibold text-gray-800 truncate">{shift.roleName}</span>
          <span className="sr-only">, </span>
          <span className="text-xs text-gray-600 flex-shrink-0">{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
        </h3>
        <button type="button" onClick={closeAndSave} aria-label="Fermer et enregistrer" title="Échap ou ✕ : ferme et enregistre" className="text-gray-600 hover:text-gray-900 flex-shrink-0 rounded p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
          <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div role="status" aria-live="polite" className={message ? "text-xs text-green-800 bg-green-50 rounded-lg px-2 py-1" : "sr-only"}>{message}</div>

      <div>
        <label htmlFor={`${id}-label`} className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
        <input id={`${id}-label`} type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={shift.roleName} aria-describedby={`${id}-label-hint`} className={field} />
        <p id={`${id}-label-hint`} className="text-xs text-gray-600 mt-0.5">Laisser vide si identique au poste. Libellé et places sont enregistrés à la fermeture (Échap ou ✕).</p>
      </div>

      <div className="flex items-end gap-2">
        <div className="w-20">
          <label htmlFor={`${id}-capacity`} className="block text-xs font-medium text-gray-700 mb-1">Places</label>
          <input id={`${id}-capacity`} type="number" min={minCapacity} value={capacity} aria-invalid={capacityTooLow ? true : undefined} aria-describedby={`${id}-capacity-hint`} onChange={e => setCapacity(Number(e.target.value))} className={`${field} text-center`} />
        </div>
        <button type="button" onClick={applyCapacity} aria-disabled={busy !== null || capacityTooLow} aria-describedby={`${id}-capacity-hint`} className={`${action} text-blue-700 hover:bg-blue-50 ${busy || capacityTooLow ? "opacity-50" : ""}`}>
          {busy === "capacity" ? "Application…" : "Appliquer à tout le poste"}
        </button>
      </div>
      <p id={`${id}-capacity-hint`} className={`text-xs -mt-2 ${capacityTooLow ? "text-red-700" : "text-gray-600"}`}>
        {capacityTooLow
          ? `Au moins ${minCapacity} : ${shift.registrationCount} personne${shift.registrationCount > 1 ? "s sont déjà inscrites" : " est déjà inscrite"}. Non enregistré en dessous.`
          : busy === "capacity" ? "Enregistrement en cours…" : "Sur tout le poste, jamais en dessous des inscrits d'un créneau."}
      </p>

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
            {busy === "move" ? "…" : "Décaler"}
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
          onChange={e => {
            setStatus(e.target.value)
            onPatch(shift.id, { status: e.target.value })
            announce(e.target.value === "closed" ? "Inscriptions fermées." : e.target.value === "open" ? "Inscriptions rouvertes." : "Statut enregistré.")
          }}
          className={field}
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
          {busy === "duplicate" ? "…" : "Dupliquer"}
        </button>
        <Link
          href={`/admin/events/${eventId}/registrations?shift=${shift.id}`}
          className={`${action} text-center text-blue-700 hover:bg-blue-50`}
          onClick={onClose}
        >
          Inscriptions
        </Link>
        <button
          type="button"
          onClick={() => { if (confirm("Supprimer ce créneau ?")) onDelete(shift.id) }}
          className={`${action} col-span-2 text-red-700 hover:bg-red-50`}
        >
          Supprimer le créneau
        </button>
      </div>
    </div>
  )
}
