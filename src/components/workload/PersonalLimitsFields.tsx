"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fmtDuration } from "@/lib/signup-recap"
import { isMinimumField, PERSONAL_FIELDS, STRICTER_LABELS, type PersonalField } from "@/lib/workload-policy"
import type { DurationInput, PersonalFormState } from "@/lib/workload-policy-form"

/** The key of a personal field in the problems (`personalMaxDailyMinutes`) and in the ids. */
export const personalKey = (f: PersonalField) => `personal${f.charAt(0).toUpperCase()}${f.slice(1)}`

/** The id of the input to focus for a personal field with a problem. */
export const personalInputId = (idPrefix: string, field: string) => `${idPrefix}-${field}-hours`

/**
 * The five optional limits of a person (#1171, lot 2), shared by the organiser's card and the
 * personal page: « heures » and « minutes », empty = the event's limit, which is said under each
 * (« Événement : 8 h au plus »). Errors under their field with `aria-invalid`.
 */
export default function PersonalLimitsFields({ idPrefix, form, onChange, errors, event }: {
  idPrefix: string
  form: PersonalFormState
  onChange: (next: PersonalFormState) => void
  errors: Map<string, string>
  /** The event's values, for the help under each field. */
  event: Record<PersonalField, number>
}) {
  const set = (f: PersonalField, part: keyof DurationInput, v: string) => onChange({ ...form, [f]: { ...form[f], [part]: v } })
  return (
    <div className="flex flex-col gap-4">
      {PERSONAL_FIELDS.map((f) => {
        const key = personalKey(f)
        const error = errors.get(key)
        const helpId = `${idPrefix}-${key}-help`
        const errorId = `${idPrefix}-${key}-error`
        return (
          <fieldset key={f} className="border-0 p-0 m-0">
            <legend className="text-xs font-medium text-gray-700 mb-1">{STRICTER_LABELS[f]}</legend>
            <div className="flex flex-wrap items-end gap-3">
              {(["hours", "minutes"] as const).map((part) => (
                <div key={part} className="w-24">
                  <label htmlFor={`${idPrefix}-${key}-${part}`} className="block text-xs font-medium text-gray-600 mb-1">{part === "hours" ? "heures" : "minutes"}</label>
                  <input
                    id={`${idPrefix}-${key}-${part}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input"
                    value={form[f][part]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={[helpId, error && errorId].filter(Boolean).join(" ")}
                    onChange={(e) => set(f, part, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <p id={helpId} className="mt-1 text-xs text-gray-600">Événement : {fmtDuration(event[f])}{isMinimumField(f) ? " au moins" : " au plus"}</p>
            {error && <p id={errorId} className="mt-1 text-sm text-red-700">{error}</p>}
          </fieldset>
        )
      })}
    </div>
  )
}
