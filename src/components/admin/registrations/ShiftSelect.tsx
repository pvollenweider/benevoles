"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef, useEffect, useMemo, useId } from "react"
import { fmtHour, fmtShortDate, overlappingShiftIds, type ShiftRef } from "@/lib/registrations-list"

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ s }: { s: ShiftRef }) {
  if (s.registrationCount >= s.capacity) {
    return <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Complet</span>
  }
  if (s.registrationCount === 0) {
    return <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">0/{s.capacity}</span>
  }
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
      {s.registrationCount}/{s.capacity}
    </span>
  )
}

// ── Custom shift dropdown ─────────────────────────────────────────────────────
export default function ShiftSelect({
  shifts, value, onChange, placeholder = "Sélectionner…", nullable = false, existingShifts, labelledBy,
}: {
  shifts: ShiftRef[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  nullable?: boolean
  existingShifts?: ShiftRef[]
  /** Id of the visible label: the trigger is named by it, then by the current choice. */
  labelledBy?: string
}) {
  const valueId = useId()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMD(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onMD)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMD)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const selected      = shifts.find(s => s.id === value) ?? null
  const alreadyIds    = useMemo(() => new Set((existingShifts ?? []).map(s => s.id)), [existingShifts])
  const conflictIds   = useMemo(() => overlappingShiftIds(shifts, existingShifts), [existingShifts, shifts])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        className="flex items-center justify-between gap-2 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px]"
      >
        <span id={valueId} className={`truncate text-left ${selected ? "text-gray-800" : "text-gray-500"}`}>
          {selected
            ? `${fmtShortDate(selected.date)} · ${fmtHour(selected.startTime)}–${fmtHour(selected.endTime)} · ${selected.roleName}${selected.label !== selected.roleName ? ` · ${selected.label}` : ""}`
            : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{ minWidth: "100%", width: "max-content", maxWidth: "90vw" }}
        >
          {nullable && (
            <div
              onClick={() => { onChange(""); setOpen(false) }}
              className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100
                ${!value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600"}`}
            >
              Tous les créneaux
            </div>
          )}
          {shifts.map(s => {
            const full       = s.registrationCount >= s.capacity
            const empty      = s.registrationCount === 0
            const alreadyReg = alreadyIds.has(s.id)
            const isConflict = conflictIds.has(s.id)
            const isSelected = value === s.id
            const rowCls = alreadyReg
              ? "border-orange-300 hover:bg-orange-50"
              : isConflict
                ? "border-amber-300 hover:bg-amber-50"
                : full
                  ? "border-red-200 hover:bg-red-50"
                  : !empty
                    ? "border-emerald-200 hover:bg-emerald-50"
                    : "border-gray-100 hover:bg-gray-50"
            return (
              <div
                key={s.id}
                onClick={() => { onChange(s.id); setOpen(false) }}
                className={`flex items-center gap-3 pl-3 pr-4 py-2 cursor-pointer border-l-2 transition-colors
                  ${rowCls} ${isSelected ? "bg-blue-50" : alreadyReg ? "bg-orange-50/50" : isConflict ? "bg-amber-50/40" : ""}`}
              >
                <span className="shrink-0 w-28 text-xs text-gray-500">{fmtShortDate(s.date)}</span>
                <span className="shrink-0 w-20 text-xs text-gray-600 tabular-nums">
                  {fmtHour(s.startTime)}–{fmtHour(s.endTime)}
                </span>
                <span className={`flex-1 text-sm font-medium min-w-0 ${alreadyReg ? "text-orange-800" : isConflict ? "text-amber-800" : "text-gray-800"}`}>
                  {s.roleName}
                  {s.label !== s.roleName && (
                    <span className="font-normal text-gray-500"> · {s.label}</span>
                  )}
                </span>
                {alreadyReg && (
                  <span className="shrink-0 text-[10px] text-orange-600 font-medium">Déjà inscrit</span>
                )}
                {isConflict && (
                  <span className="shrink-0 text-[10px] text-amber-600 font-medium">⚠ conflit</span>
                )}
                <StatusPill s={s} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
