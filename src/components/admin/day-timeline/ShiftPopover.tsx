"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import { getRoleAccent } from "@/lib/roles"
import { fmt, clamp } from "@/lib/gantt-utils"
import { ROW_H } from "@/lib/day-timeline"
import type { AdminShift } from "../AdminDayTimeline"

export default function ShiftPopover({
  shift, anchor, eventId, onClose, onPatch, onDelete,
}: {
  shift:    AdminShift
  anchor:   { x: number; y: number; w: number }
  eventId:  string
  onClose:  () => void
  onPatch:  (id: string, data: Partial<AdminShift>) => void
  onDelete: (id: string) => void
}) {
  const [label, setLabel]       = useState(shift.label === shift.roleName ? "" : shift.label)
  const [capacity, setCapacity] = useState(shift.capacity)
  const [status, setStatus]     = useState(shift.status)
  const ref = useRef<HTMLDivElement>(null)

  // Sync latest values into refs so closeAndSave closure stays stable
  const labelRef    = useRef(label)
  const capacityRef = useRef(capacity)
  useEffect(() => { labelRef.current = label },    [label])
  useEffect(() => { capacityRef.current = capacity }, [capacity])

  const closeAndSave = useCallback(() => {
    onPatch(shift.id, {
      label:    labelRef.current.trim() || shift.roleName,
      capacity: capacityRef.current,
    })
    onClose()
  }, [shift.id, shift.roleName, onPatch, onClose])

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

  const POPW = 244
  const left = clamp(anchor.x + anchor.w / 2 - POPW / 2, 8, window.innerWidth - POPW - 8)
  const top  = anchor.y + ROW_H + 6

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 space-y-2.5"
      style={{ left, top, width: POPW }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getRoleAccent(shift.roleName, shift.colorKey)}`} />
          <span className="text-xs font-semibold text-gray-700 truncate">{shift.roleName}</span>
          <span className="text-[10px] text-gray-500 flex-shrink-0">
            {fmt(shift.startTime)}–{fmt(shift.endTime)}
          </span>
        </div>
        <button onClick={closeAndSave} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={shift.roleName}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
        />
        <p className="text-[9px] text-gray-500 mt-0.5 ml-0.5">
          Libellé — laisser vide si identique au poste
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-500 flex-shrink-0">Places</label>
        <input
          type="number"
          min={Math.max(shift.registrationCount, 1)}
          value={capacity}
          onChange={e => setCapacity(Number(e.target.value))}
          className="w-14 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); onPatch(shift.id, { status: e.target.value }) }}
          className="flex-1 text-[10px] border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="open">Ouvert</option>
          <option value="full">Complet</option>
          <option value="closed">Fermé</option>
          <option value="cancelled">Annulé</option>
        </select>
      </div>

      {shift.registrationCount > 0 && (
        <p className="text-[9px] text-orange-600">
          {shift.registrationCount} inscription{shift.registrationCount > 1 ? "s" : ""} existante{shift.registrationCount > 1 ? "s" : ""}
        </p>
      )}

      <Link
        href={`/admin/events/${eventId}/registrations?shift=${shift.id}`}
        className="block w-full text-center text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg py-1 transition-colors"
        onClick={onClose}
      >
        Voir les inscriptions →
      </Link>

      <button
        onClick={() => { if (confirm("Supprimer ce créneau ?")) onDelete(shift.id) }}
        className="w-full text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg py-1 transition-colors"
      >
        Supprimer le créneau
      </button>
    </div>
  )
}
