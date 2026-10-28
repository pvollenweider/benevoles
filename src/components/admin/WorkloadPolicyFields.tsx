"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import RequiredMark from "@/components/RequiredMark"
import { OFF_DAY_LABEL, OFF_DAY_MIN_LABEL, OFF_DAY_WINDOW_LABEL, SERVICE_DAY_START_LABEL, serviceDayExamples, WORKLOAD_LIMIT_FIELDS, type EventHorizon, type WorkloadLimitsV1 } from "@/lib/workload-policy"
import { OFF_DAY_HELP, offDayExample, SERVICE_DAY_START_HELP, WORKLOAD_FIELD_HELP, type DurationInput, type OffDayInput, type PolicyFormState } from "@/lib/workload-policy-form"

type LimitField = keyof WorkloadLimitsV1

/**
 * The fields of the workload protection (#1171), shared by the event's card and the organisation's
 * default: the start of the service day (with worked examples, not live), then one fieldset per
 * limit with « heures » and « minutes », then the days-off rule (an explicit answer: two radios, the
 * two numbers shown only with « Appliquer »). Errors sit under their field, with `aria-invalid`; the
 * parent focuses the first invalid input (`fieldInputId`).
 */
export default function WorkloadPolicyFields({ idPrefix, form, onChange, errors, disabled = false, horizon }: {
  idPrefix: string
  form: PolicyFormState
  onChange: (next: PolicyFormState) => void
  /** Field key → message (from the local check or the server's 400). */
  errors: Map<string, string>
  disabled?: boolean
  /** The event's service days (event card only): the days-off example under the period. */
  horizon?: EventHorizon
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

      <OffDayFieldset idPrefix={idPrefix} value={form.offDay} onChange={(offDay) => onChange({ ...form, offDay })} errors={errors} disabled={disabled} example={horizon ? offDayExample(form, horizon) : null} />
    </div>
  )
}

/** « Jours sans mission »: apply or not (required, no default), then N and P when applied. */
function OffDayFieldset({ idPrefix, value, onChange, errors, disabled, example }: {
  idPrefix: string
  value: OffDayInput
  onChange: (next: OffDayInput) => void
  errors: Map<string, string>
  disabled: boolean
  example: string | null
}) {
  const id = `${idPrefix}-offDay`
  const choiceError = errors.get("offDay")
  const minError = errors.get("offDayMinOffDays")
  const windowError = errors.get("offDayWindowDays")
  const choiceDescribedBy = choiceError ? `${id}-error` : undefined
  const numbers: { key: "minOffDays" | "windowDays"; label: string; error?: string; field: string }[] = [
    { key: "minOffDays", label: OFF_DAY_MIN_LABEL, error: minError, field: "offDayMinOffDays" },
    { key: "windowDays", label: OFF_DAY_WINDOW_LABEL, error: windowError, field: "offDayWindowDays" },
  ]
  return (
    <fieldset className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2" data-workload-offday="1">
      <legend className="px-1 text-sm font-medium text-gray-800">{OFF_DAY_LABEL} <RequiredMark /></legend>
      <div className="flex flex-wrap gap-x-6">
        {([["yes", "Appliquer cette règle"], ["no", "Ne pas appliquer cette règle"]] as const).map(([v, label]) => (
          <label key={v} htmlFor={`${id}-${v}`} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-800">
            <input
              id={`${id}-${v}`}
              type="radio"
              name={`${id}-apply`}
              value={v}
              required
              checked={value.apply === v}
              aria-describedby={choiceDescribedBy}
              onChange={() => { if (!disabled) onChange({ ...value, apply: v }) }}
              className="h-5 w-5 shrink-0"
            />
            {label}
          </label>
        ))}
      </div>
      {choiceError && <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{choiceError}</p>}
      {value.apply === "yes" && (
        <div className="mt-1">
          <div className="flex flex-wrap items-end gap-3">
            {numbers.map((n) => {
              const describedBy = [`${id}-help`, n.error && `${id}-${n.key}-error`, n.key === "windowDays" && example && `${id}-example`].filter(Boolean).join(" ")
              return (
                <div key={n.key} className="w-40">
                  <label htmlFor={`${id}-${n.key}`} className="block text-xs font-medium text-gray-600 mb-1">{n.label}</label>
                  <input
                    id={`${id}-${n.key}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input"
                    value={value[n.key]}
                    readOnly={disabled}
                    aria-required
                    aria-invalid={n.error ? true : undefined}
                    aria-describedby={describedBy}
                    onChange={(e) => onChange({ ...value, [n.key]: e.target.value })}
                  />
                </div>
              )
            })}
          </div>
          <p id={`${id}-help`} className="mt-1 text-xs text-gray-600">{OFF_DAY_HELP}</p>
          {numbers.map((n) => n.error && <p key={n.key} id={`${id}-${n.key}-error`} className="mt-1 text-sm text-red-700">{n.error}</p>)}
          {example && <p id={`${id}-example`} className="mt-2 text-xs text-gray-700">{example}</p>}
        </div>
      )}
    </fieldset>
  )
}

/** The id of the input to focus for a field with a problem. */
export function fieldInputId(idPrefix: string, field: string): string {
  if (field === "serviceDayStart") return `${idPrefix}-serviceDayStart`
  if (field === "offDay") return `${idPrefix}-offDay-yes`
  if (field === "offDayMinOffDays") return `${idPrefix}-offDay-minOffDays`
  if (field === "offDayWindowDays") return `${idPrefix}-offDay-windowDays`
  return `${idPrefix}-${field}-hours`
}
