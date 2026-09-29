"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId } from "react"
import { AVAILABILITY_PERIODS, AVAILABILITY_NOTE_MAX, type AvailabilityPeriod } from "@/lib/availability"

type Props = {
  periods: string[]
  note: string
  onChange: (next: { periods: AvailabilityPeriod[]; note: string }) => void
  /** Wording for the volunteer (« je suis ») or the organizer (« la personne est »). */
  voice?: "volunteer" | "admin"
}

/** Optional availability (#402): three checkboxes and a short note, shared by both forms. */
export default function AvailabilityFields({ periods, note, onChange, voice = "admin" }: Props) {
  const id = useId()
  const selected = AVAILABILITY_PERIODS.map((p) => p.id).filter((p) => periods.includes(p))
  return (
    <div className="space-y-2">
      <fieldset>
        <legend className="block text-sm text-gray-700 mb-1">
          {voice === "volunteer" ? "Je suis en général disponible" : "Disponible en général"} <span className="text-gray-500">(facultatif)</span>
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {AVAILABILITY_PERIODS.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 min-h-8">
              <input
                id={`${id}-${p.id}`}
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(e) => onChange({ periods: e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id), note })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor={`${id}-${p.id}`} className="text-sm text-gray-800">{p.label}</label>
            </div>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`${id}-note`} className="block text-sm text-gray-700 mb-1">
          {voice === "volunteer" ? "Sauf…" : "Sauf / à savoir"} <span className="text-gray-500">(facultatif)</span>
        </label>
        <input
          id={`${id}-note`}
          type="text"
          value={note}
          maxLength={AVAILABILITY_NOTE_MAX}
          aria-describedby={`${id}-note-hint`}
          onChange={(e) => onChange({ periods: selected, note: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        />
        <p id={`${id}-note-hint`} className="text-xs text-gray-600 mt-1">Une phrase courte, par exemple « pas le dimanche ». {note.length}/{AVAILABILITY_NOTE_MAX} caractères.</p>
      </div>
    </div>
  )
}
