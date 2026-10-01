"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId, type KeyboardEvent } from "react"
import { fmtHour, fmtShortDate, overlappingShiftIds, type ShiftRef } from "@/lib/registrations-list"
import { isRepeatedLetter, moveActive, panelShift, shiftOptionLabel, shiftTypeaheadText, typeaheadIndex, type MoveKey } from "@/lib/shift-select"

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ s }: { s: ShiftRef }) {
  if (s.registrationCount >= s.capacity) {
    return <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">Complet</span>
  }
  if (s.registrationCount === 0) {
    return <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">0/{s.capacity}</span>
  }
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
      {s.registrationCount}/{s.capacity}
    </span>
  )
}

// The selected option is marked by a check, not by its background colour alone.
function Check({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 shrink-0 text-blue-700 forced-colors:text-[CanvasText] ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

const MOVE_KEYS = new Set<string>(["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"])
const TYPEAHEAD_RESET_MS = 500

// ── Custom shift dropdown ─────────────────────────────────────────────────────
// A select-only combobox (WAI-ARIA APG, #555): the focus stays on the trigger, the option being
// pointed at is given by aria-activedescendant.
export default function ShiftSelect({
  shifts, value, onChange, placeholder = "Sélectionner…", nullable = false, existingShifts, labelledBy,
}: {
  shifts: ShiftRef[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  nullable?: boolean
  existingShifts?: ShiftRef[]
  /** Id of the visible label naming the trigger and its list. */
  labelledBy?: string
}) {
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // How far the open list moves left to stay on screen near the right edge (WCAG 1.4.10).
  const [shift, setShift] = useState(0)
  const typed = useRef("")
  const typedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTyped() {
    typed.current = ""
    if (typedTimer.current) clearTimeout(typedTimer.current)
    typedTimer.current = null
  }

  useEffect(() => {
    if (!open) return
    function onMD(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIndex(-1)
        typed.current = ""
      }
    }
    document.addEventListener("mousedown", onMD)
    return () => document.removeEventListener("mousedown", onMD)
  }, [open])

  useEffect(() => () => { if (typedTimer.current) clearTimeout(typedTimer.current) }, [])

  const selected      = shifts.find(s => s.id === value) ?? null
  const alreadyIds    = useMemo(() => new Set((existingShifts ?? []).map(s => s.id)), [existingShifts])
  const conflictIds   = useMemo(() => overlappingShiftIds(shifts, existingShifts), [existingShifts, shifts])

  // Every option in list order: « Tous les créneaux » first when the choice can be empty.
  const options = useMemo(() => [
    ...(nullable ? [{ id: "", domId: `${listboxId}-opt-all`, typeahead: "Tous les créneaux" }] : []),
    ...shifts.map(s => ({ id: s.id, domId: `${listboxId}-opt-${s.id}`, typeahead: shiftTypeaheadText(s) })),
  ], [nullable, shifts, listboxId])
  const selectedIndex = options.findIndex(o => o.id === value)
  const activeDomId = open && activeIndex >= 0 ? options[activeIndex]?.domId : undefined

  // Placed before paint, so the list never shows past the right edge; follows window resizes.
  // A shift left from the last opening is replaced before the list is painted again.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const trigger = ref.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      setShift(panelShift(trigger.getBoundingClientRect().left, panel.offsetWidth, document.documentElement.clientWidth))
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open, options.length])

  // Keeps the active option in view while moving through a long list.
  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView?.({ block: "nearest" })
  }, [activeDomId])

  function openList(index: number) {
    setOpen(true)
    setActiveIndex(index)
  }

  function close() {
    setOpen(false)
    setActiveIndex(-1)
    clearTyped()
  }

  function commit(index: number) {
    const option = options[index]
    if (option) onChange(option.id)
    close()
  }

  // Type-ahead: the letters typed within half a second find the option starting with them.
  function typeahead(ch: string, base: number) {
    const buffer = typed.current + ch
    typed.current = buffer
    if (typedTimer.current) clearTimeout(typedTimer.current)
    typedTimer.current = setTimeout(() => { typed.current = "" }, TYPEAHEAD_RESET_MS)
    // One letter (or the same letter again) looks past the current option; more letters refine it.
    const repeat = isRepeatedLetter(buffer)
    const found = typeaheadIndex(options.map(o => o.typeahead), buffer, repeat ? base + 1 : Math.max(base, 0))
    if (found >= 0) setActiveIndex(found)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const { key } = e
    const printable = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    const start = selectedIndex >= 0 ? selectedIndex : 0

    if (!open) {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === " ") { e.preventDefault(); openList(options.length > 0 ? start : -1) }
      else if (key === "Home") { e.preventDefault(); openList(options.length > 0 ? 0 : -1) }
      else if (key === "End") { e.preventDefault(); openList(options.length - 1) }
      else if (printable) { e.preventDefault(); openList(selectedIndex); typeahead(key, selectedIndex) }
      // Escape on a closed list is left to the page.
      return
    }

    if (key === "Tab") { commit(activeIndex); return }
    if (key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return }
    if (key === "ArrowUp" && e.altKey) { e.preventDefault(); commit(activeIndex); return }
    if (key === "Enter" || (key === " " && typed.current === "")) { e.preventDefault(); commit(activeIndex); return }
    if (MOVE_KEYS.has(key)) { e.preventDefault(); setActiveIndex(moveActive(key as MoveKey, activeIndex, options.length)); return }
    if (printable) { e.preventDefault(); typeahead(key, activeIndex) }
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        role="combobox"
        tabIndex={0}
        onClick={() => (open ? close() : openList(selectedIndex))}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeDomId}
        aria-labelledby={labelledBy}
        className="flex items-center justify-between gap-2 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 min-h-[38px]"
      >
        <span className={`text-left min-w-0 wrap-break-word sm:truncate ${selected ? "text-gray-800" : "text-gray-500"}`}>
          {selected
            ? `${fmtShortDate(selected.date)} · ${fmtHour(selected.startTime)}–${fmtHour(selected.endTime)} · ${selected.roleName}${selected.label !== selected.roleName ? ` · ${selected.label}` : ""}`
            : placeholder}
        </span>
        <svg
          aria-hidden="true"
          className={`w-4 h-4 text-gray-500 shrink-0 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown list */}
      {open && (
        <div
          ref={panelRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={labelledBy}
          // A click on an option leaves the focus on the trigger.
          onMouseDown={e => e.preventDefault()}
          // As wide as the trigger on a small screen, as wide as its rows from `sm` on.
          className="absolute top-full mt-1 left-0 z-50 w-full sm:w-max bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{ minWidth: "100%", maxWidth: "90vw", left: shift ? -shift : undefined }}
        >
          {nullable && (
            <div
              id={options[0].domId}
              role="option"
              aria-selected={!value}
              onClick={() => commit(0)}
              onMouseMove={() => setActiveIndex(0)}
              className={`relative px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100
                ${!value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600"}
                ${activeIndex === 0 ? "outline outline-2 -outline-offset-2 outline-blue-600" : ""}`}
            >
              {!value && <Check className="left-0.5" />}
              Tous les créneaux
            </div>
          )}
          {shifts.map((s, i) => {
            const index      = nullable ? i + 1 : i
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
                id={options[index].domId}
                role="option"
                aria-selected={isSelected}
                aria-label={shiftOptionLabel(s, { alreadyRegistered: alreadyReg, conflict: isConflict })}
                onClick={() => commit(index)}
                onMouseMove={() => setActiveIndex(index)}
                className={`relative flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 pl-3 pr-4 py-2 cursor-pointer border-l-2 transition-colors
                  ${rowCls} ${isSelected ? "bg-blue-50" : alreadyReg ? "bg-orange-50/50" : isConflict ? "bg-amber-50/40" : ""}
                  ${activeIndex === index ? "outline outline-2 -outline-offset-2 outline-blue-600" : ""}`}
              >
                {isSelected && <Check className="left-0" />}
                <span className="shrink-0 sm:w-28 text-xs text-gray-600">{fmtShortDate(s.date)}</span>
                <span className="shrink-0 sm:w-20 text-xs text-gray-600 tabular-nums">
                  {fmtHour(s.startTime)}–{fmtHour(s.endTime)}
                </span>
                <span className={`flex-1 min-w-[8rem] sm:min-w-0 wrap-break-word text-sm font-medium ${alreadyReg ? "text-orange-800" : isConflict ? "text-amber-800" : "text-gray-800"}`}>
                  {s.roleName}
                  {s.label !== s.roleName && (
                    <span className="font-normal text-gray-600"> · {s.label}</span>
                  )}
                </span>
                {alreadyReg && (
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-orange-800 font-medium">Déjà inscrit</span>
                )}
                {isConflict && (
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-amber-800 font-medium">⚠ conflit</span>
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
