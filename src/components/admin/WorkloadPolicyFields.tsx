"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import RequiredMark from "@/components/RequiredMark"
import { SERVICE_DAY_START_LABEL, serviceDayExamples, WORKLOAD_LIMIT_FIELDS, type WorkloadLimitsV1 } from "@/lib/workload-policy"
import { SERVICE_DAY_START_HELP, WORKLOAD_FIELD_HELP, type DurationInput, type PolicyFormState } from "@/lib/workload-policy-form"

type LimitField = keyof WorkloadLimitsV1

/**
 * The fields of the workload protection (#1171), shared by the event's card and the organisation's
 * default: the start of the service day (with worked examples, not live), then one fieldset per
 * limit with « heures » and « minutes ». Errors sit under their field, with `aria-invalid`; the
 * parent focuses the first invalid input (`firstInputId`).
 */
export default function WorkloadPolicyFields({ idPrefix, form, onChange, errors, disabled = false }: {
  idPrefix: string
  form: PolicyFormState
  onChange: (next: PolicyFormState) => void
  /** Field key → message (from the local check or the server's 400). */
  errors: Map<string, string>
  disabled?: boolean
}) {
  const startError = errors.get("serviceDayStart")
  const examples = serviceDayExamples(form.serviceDayStart)
  const setDuration = (key: LimitField, part: keyof DurationInput, value: string) => onChange({ ...form, [key]: { ...form[key], [part]: value } })

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-serviceDayStart`} className="block text-sm font-medium text-gray-700 mb-1">
          {SERVICE_DAY_START_LABEL} <RequiredMark />
        </label>
        <div className="w-40">
        <input
          id={`${idPrefix}-serviceDayStart`}
          type="time"
          step={60}
          required
          className="input"
          value={form.serviceDayStart}
          readOnly={disabled}
          aria-invalid={startError ? true : undefined}
          aria-describedby={[`${idPrefix}-serviceDayStart-help`, startError && `${idPrefix}-serviceDayStart-error`].filter(Boolean).join(" ")}
          onChange={(e) => onChange({ ...form, serviceDayStart: e.target.value })}
        />
        </div>
        <p id={`${idPrefix}-serviceDayStart-help`} className="mt-1 text-xs text-gray-600">{SERVICE_DAY_START_HELP}</p>
        {startError && <p id={`${idPrefix}-serviceDayStart-error`} className="mt-1 text-sm text-red-700">{startError}</p>}
        {examples.length > 0 && (
          <div className="mt-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700">
            <p className="font-medium text-gray-800">Exemples :</p>
            <ul role="list" className="mt-1 list-disc pl-5 space-y-0.5">
              {examples.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        )}
      </div>

      {WORKLOAD_LIMIT_FIELDS.map((f) => {
        const error = errors.get(f.key)
        const helpId = `${idPrefix}-${f.key}-help`
        const errorId = `${idPrefix}-${f.key}-error`
        const describedBy = [helpId, error && errorId].filter(Boolean).join(" ")
        return (
          <fieldset key={f.key} className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
            <legend className="px-1 text-sm font-medium text-gray-800">{f.label} <RequiredMark /></legend>
            <div className="flex flex-wrap items-end gap-3">
              {(["hours", "minutes"] as const).map((part) => (
                <div key={part} className="w-24">
                  <label htmlFor={`${idPrefix}-${f.key}-${part}`} className="block text-xs font-medium text-gray-600 mb-1">{part === "hours" ? "heures" : "minutes"}</label>
                  <input
                    id={`${idPrefix}-${f.key}-${part}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input"
                    value={form[f.key][part]}
                    readOnly={disabled}
                    aria-required={part === "hours" ? true : undefined}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(e) => setDuration(f.key, part, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <p id={helpId} className="mt-1 text-xs text-gray-600">{WORKLOAD_FIELD_HELP[f.key]}</p>
            {error && <p id={errorId} className="mt-1 text-sm text-red-700">{error}</p>}
          </fieldset>
        )
      })}
    </div>
  )
}

/** The id of the input to focus for a field with a problem. */
export function fieldInputId(idPrefix: string, field: string): string {
  return field === "serviceDayStart" ? `${idPrefix}-serviceDayStart` : `${idPrefix}-${field}-hours`
}
