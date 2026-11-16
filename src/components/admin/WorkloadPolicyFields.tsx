"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { flushSync } from "react-dom"
import RequiredMark from "@/components/RequiredMark"
import {
  MEAL_DAYS_LABEL, MEAL_LABEL, MEAL_MINUTES_LABEL, MEAL_WINDOWS_LABEL, MEAL_WINDOWS_MAX, OFF_DAY_LABEL, OFF_DAY_MIN_LABEL, OFF_DAY_WINDOW_LABEL,
  isMinimumField, MINORS_LABEL, SERVICE_DAY_START_LABEL, serviceDayExamples, STRICTER_FIELDS, STRICTER_LABELS, TRAVEL_LABEL, TRAVEL_MINUTES_LABEL, WORKLOAD_LIMIT_FIELDS,
  type EventHorizon, type StricterField, type WorkloadLimitsV1,
} from "@/lib/workload-policy"
import { fmtDuration } from "@/lib/signup-recap"
import {
  durationMinutes, MEAL_HELP, mealDayOptions, MINORS_HELP, OFF_DAY_HELP, offDayExample, SERVICE_DAY_START_HELP, TRAVEL_HELP, withMealWindow, WORKLOAD_FIELD_HELP,
  type DurationInput, type MealInput, type MinorsInput, type OffDayInput, type PolicyFormState, type TravelInput,
} from "@/lib/workload-policy-form"

type LimitField = keyof WorkloadLimitsV1

/**
 * The fields of the workload protection (#1171), shared by the event's card and the organisation's
 * default: the start of the service day (with worked examples, not live), then one fieldset per
 * limit with « heures » and « minutes », then the days-off rule (an explicit answer: two radios, the
 * two numbers shown only with « Appliquer »), then the meal rule (same pattern: duration, one to three
 * windows, days). Errors sit under their field, with `aria-invalid`; the parent focuses the first
 * invalid input (`fieldInputId`).
 */
export default function WorkloadPolicyFields({ idPrefix, form, onChange, errors, disabled = false, horizon, places, minorsNote }: {
  idPrefix: string
  form: PolicyFormState
  onChange: (next: PolicyFormState) => void
  /** Field key → message (from the local check or the server's 400). */
  errors: Map<string, string>
  disabled?: boolean
  /**
   * The event's service days (event card only): the days-off example under the period, and the
   * days to tick for the meal. Without it (organisation default), the meal applies every day.
   */
  horizon?: EventHorizon
  /**
   * The event's places (event card only): the line on shifts without a place, and the link to the
   * places section of the shifts page. Absent in the organisation default.
   */
  places?: { text: string | null; href: string }
  /** The line on people without a birth date (event card), or nothing. */
  minorsNote?: string | null
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

      <MealFieldset idPrefix={idPrefix} value={form.meal} onChange={(meal) => onChange({ ...form, meal })} errors={errors} disabled={disabled} horizon={horizon} />

      <TravelFieldset idPrefix={idPrefix} value={form.travel} onChange={(travel) => onChange({ ...form, travel })} errors={errors} disabled={disabled} places={places} />

      <MinorsFieldset idPrefix={idPrefix} value={form.minors} onChange={(minors) => onChange({ ...form, minors })} errors={errors} disabled={disabled} eventValues={form} note={minorsNote ?? null} />
    </div>
  )
}

const errorText = "mt-1 text-sm text-red-700"

/** The key of a minors field in the problems (`minorsMaxDailyMinutes`) and in the ids. */
export const minorsKey = (f: StricterField) => `minors${f.charAt(0).toUpperCase()}${f.slice(1)}`

/**
 * « Moins de 18 ans » (#1171, lot 2): apply or not (required), then four durations, each at least as
 * strict as the event's (whose current value, as typed above, is said under it). Two levels of
 * fieldsets, the inner ones plain like the meal's.
 */
function MinorsFieldset({ idPrefix, value, onChange, errors, disabled, eventValues, note }: {
  idPrefix: string
  value: MinorsInput
  onChange: (next: MinorsInput) => void
  errors: Map<string, string>
  disabled: boolean
  eventValues: PolicyFormState
  note: string | null
}) {
  const id = `${idPrefix}-minors`
  const choiceError = errors.get("minors")
  const eventValue = (f: StricterField) => {
    const n = durationMinutes(eventValues[f])
    return n === undefined || Number.isNaN(n) ? "renseignez d'abord la limite de l'événement" : `${fmtDuration(n)}${isMinimumField(f) ? " au moins" : " au plus"}`
  }
  return (
    <fieldset className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2" data-workload-minors="1">
      <legend className="px-1 text-sm font-medium text-gray-800">{MINORS_LABEL} <RequiredMark /></legend>
      <p id={`${id}-intro`} className="text-xs text-gray-600">{MINORS_HELP}</p>
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
              aria-describedby={[`${id}-intro`, choiceError && `${id}-error`].filter(Boolean).join(" ")}
              onChange={() => { if (!disabled) onChange({ ...value, apply: v }) }}
              className="h-5 w-5 shrink-0"
            />
            {label}
          </label>
        ))}
      </div>
      {choiceError && <p id={`${id}-error`} className={errorText}>{choiceError}</p>}
      {value.apply === "yes" && (
        <div className="mt-1 flex flex-col gap-4">
          {STRICTER_FIELDS.map((f) => {
            const key = minorsKey(f)
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
                        value={value[f][part]}
                        readOnly={disabled}
                        aria-required={part === "hours" ? true : undefined}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={[helpId, error && errorId].filter(Boolean).join(" ")}
                        onChange={(e) => onChange({ ...value, [f]: { ...value[f], [part]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
                <p id={helpId} className="mt-1 text-xs text-gray-600">Événement : {eventValue(f)}</p>
                {error && <p id={errorId} className={errorText}>{error}</p>}
              </fieldset>
            )
          })}
          {note && <p className="text-xs text-gray-700">{note}</p>}
        </div>
      )}
    </fieldset>
  )
}

/** « Trajet entre deux lieux » (#1171, lot 2): apply or not (required), then the margin (0 to 15 min). */
function TravelFieldset({ idPrefix, value, onChange, errors, disabled, places }: {
  idPrefix: string
  value: TravelInput
  onChange: (next: TravelInput) => void
  errors: Map<string, string>
  disabled: boolean
  places?: { text: string | null; href: string }
}) {
  const id = `${idPrefix}-travel`
  const choiceError = errors.get("travel")
  const minutesError = errors.get("travelMinutes")
  return (
    <fieldset className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2" data-workload-travel="1">
      <legend className="px-1 text-sm font-medium text-gray-800">{TRAVEL_LABEL} <RequiredMark /></legend>
      <p id={`${id}-intro`} className="text-xs text-gray-600">Le temps d&apos;aller d&apos;un lieu de l&apos;événement à un autre, une scène à l&apos;autre par exemple.</p>
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
              aria-describedby={[`${id}-intro`, choiceError && `${id}-error`].filter(Boolean).join(" ")}
              onChange={() => { if (!disabled) onChange({ ...value, apply: v }) }}
              className="h-5 w-5 shrink-0"
            />
            {label}
          </label>
        ))}
      </div>
      {choiceError && <p id={`${id}-error`} className={errorText}>{choiceError}</p>}
      {value.apply === "yes" && (
        <div className="mt-1">
          <div className="w-40">
            <label htmlFor={`${id}-minutes`} className="block text-xs font-medium text-gray-600 mb-1">{TRAVEL_MINUTES_LABEL}</label>
            <input
              id={`${id}-minutes`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="input"
              value={value.minutes}
              readOnly={disabled}
              aria-required
              aria-invalid={minutesError ? true : undefined}
              aria-describedby={[`${id}-help`, places?.text && `${id}-places`, minutesError && `${id}-minutes-error`].filter(Boolean).join(" ")}
              onChange={(e) => onChange({ ...value, minutes: e.target.value })}
            />
          </div>
          {minutesError && <p id={`${id}-minutes-error`} className={errorText}>{minutesError}</p>}
          <p id={`${id}-help`} className="mt-1 text-xs text-gray-600">{TRAVEL_HELP}</p>
          {places?.text && (
            <p className="mt-2 text-xs text-gray-700">
              <span id={`${id}-places`}>{places.text}</span>{" "}
              <a href={places.href} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Choisir les lieux dans Créneaux</a>
            </p>
          )}
        </div>
      )}
    </fieldset>
  )
}
const smallButton = "min-h-11 sm:min-h-6 rounded-xl border border-blue-600 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-50"

/**
 * « Pause repas » (#1171, lot 2): apply or not (required), then the duration, one to three windows
 * (each problem under its own row) and the days. Two levels of fieldsets at most; the rows are not
 * fieldsets. Added rows take the focus on their « Début »; a removed row hands it to the previous one.
 */
function MealFieldset({ idPrefix, value, onChange, errors, disabled, horizon }: {
  idPrefix: string
  value: MealInput
  onChange: (next: MealInput) => void
  errors: Map<string, string>
  disabled: boolean
  horizon?: EventHorizon
}) {
  const id = `${idPrefix}-meal`
  const choiceError = errors.get("meal")
  const minutesError = errors.get("mealMinutes")
  const windowsError = errors.get("mealWindows")
  const daysError = errors.get("mealDays")
  const days = horizon ? mealDayOptions(horizon) : []
  const set = (next: Partial<MealInput>) => { if (!disabled) onChange({ ...value, ...next }) }
  const focus = (elementId: string) => document.getElementById(elementId)?.focus()

  function addWindow() {
    if (disabled) return
    const next = withMealWindow(value, { add: true })
    flushSync(() => onChange(next))
    focus(`${id}-w${next.windows.length - 1}-start`)
  }

  function removeWindow(i: number) {
    if (disabled) return
    flushSync(() => onChange(withMealWindow(value, { remove: i })))
    focus(`${id}-w${Math.max(0, i - 1)}-start`)
  }

  return (
    <fieldset className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2" data-workload-meal="1">
      <legend className="px-1 text-sm font-medium text-gray-800">{MEAL_LABEL} <RequiredMark /></legend>
      <p id={`${id}-intro`} className="text-xs text-gray-600">Un temps pour manger, dans les plages que vous choisissez, pour chaque personne dont une mission touche une plage.</p>
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
              aria-describedby={[`${id}-intro`, choiceError && `${id}-error`].filter(Boolean).join(" ")}
              onChange={() => set({ apply: v })}
              className="h-5 w-5 shrink-0"
            />
            {label}
          </label>
        ))}
      </div>
      {choiceError && <p id={`${id}-error`} className={errorText}>{choiceError}</p>}

      {value.apply === "yes" && (
        <div className="mt-1 flex flex-col gap-4">
          <div className="w-24">
            <label htmlFor={`${id}-minutes`} className="block text-xs font-medium text-gray-600 mb-1">{MEAL_MINUTES_LABEL}</label>
            <input
              id={`${id}-minutes`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="input"
              value={value.minutes}
              readOnly={disabled}
              aria-required
              aria-invalid={minutesError ? true : undefined}
              aria-describedby={[`${id}-help`, minutesError && `${id}-minutes-error`].filter(Boolean).join(" ")}
              onChange={(e) => set({ minutes: e.target.value })}
            />
          </div>
          {minutesError && <p id={`${id}-minutes-error`} className={errorText}>{minutesError}</p>}

          <fieldset className="border-0 p-0 m-0">
            <legend className="text-xs font-medium text-gray-600 mb-1">{MEAL_WINDOWS_LABEL}</legend>
            <ul role="list" className="space-y-2">
              {value.windows.map((w, i) => {
                const rowError = errors.get(`mealWindow${i}`)
                // The error about the plages as a whole sits on the first row's fields (where focus goes).
                const listError = i === 0 ? windowsError : undefined
                const describedBy = [rowError && `${id}-w${i}-error`, listError && `${id}-windows-error`].filter(Boolean).join(" ") || undefined
                return (
                  <li key={w.key}>
                    <p className="text-xs font-medium text-gray-800">Plage {i + 1}</p>
                    <div className="flex flex-wrap items-end gap-3">
                      {(["start", "end"] as const).map((part) => (
                        <div key={part} className="w-40">
                          <label htmlFor={`${id}-w${i}-${part}`} className="block text-xs font-medium text-gray-600 mb-1">
                            {part === "start" ? "Début" : "Fin"}{" "}<span className="sr-only">{`de la plage ${i + 1}`}</span>
                          </label>
                          <input
                            id={`${id}-w${i}-${part}`}
                            type="time"
                            step={60}
                            className="input"
                            value={w[part]}
                            readOnly={disabled}
                            aria-required
                            aria-invalid={rowError || listError ? true : undefined}
                            aria-describedby={describedBy}
                            onChange={(e) => set({ windows: value.windows.map((x, j) => (j === i ? { ...x, [part]: e.target.value } : x)) })}
                          />
                        </div>
                      ))}
                      {value.windows.length > 1 && (
                        <button type="button" onClick={() => removeWindow(i)} className={smallButton}>
                          Retirer{" "}<span className="sr-only">{`la plage ${i + 1}`}</span>
                        </button>
                      )}
                    </div>
                    {rowError && <p id={`${id}-w${i}-error`} className={errorText}>{rowError}</p>}
                  </li>
                )
              })}
            </ul>
            {windowsError && <p id={`${id}-windows-error`} className={errorText}>{windowsError}</p>}
            <div className="mt-2">
              {value.windows.length < MEAL_WINDOWS_MAX
                ? <button type="button" onClick={addWindow} className={smallButton}>Ajouter une plage</button>
                : <p className="text-xs text-gray-600">{MEAL_WINDOWS_MAX} plages au plus.</p>}
            </div>
          </fieldset>

          {horizon ? (
            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs font-medium text-gray-600 mb-1">{MEAL_DAYS_LABEL}</legend>
              {([["all", "Tous les jours de l'événement"], ["some", "Certains jours"]] as const).map(([v, label]) => (
                <label key={v} htmlFor={`${id}-days-${v}`} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-800">
                  <input
                    id={`${id}-days-${v}`}
                    type="radio"
                    name={`${id}-days`}
                    value={v}
                    checked={value.days === v}
                    onChange={() => set({ days: v })}
                    className="h-5 w-5 shrink-0"
                  />
                  {label}
                </label>
              ))}
              {value.days === "some" && (
                <ul role="list" className="ml-7 space-y-0.5">
                  {days.map((d, k) => (
                    <li key={d.date}>
                      <label htmlFor={`${id}-day-${k}`} className="flex min-h-11 sm:min-h-6 cursor-pointer items-center gap-2 text-sm text-gray-800">
                        <input
                          id={`${id}-day-${k}`}
                          type="checkbox"
                          checked={value.dates.includes(d.date)}
                          aria-invalid={daysError ? true : undefined}
                          aria-describedby={daysError ? `${id}-days-error` : undefined}
                          onChange={(e) => set({ dates: e.target.checked ? [...value.dates, d.date] : value.dates.filter((x) => x !== d.date) })}
                          className="h-4 w-4 shrink-0"
                        />
                        {d.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {daysError && <p id={`${id}-days-error`} className={errorText}>{daysError}</p>}
            </fieldset>
          ) : (
            <p className="text-xs text-gray-700">Pour les nouveaux événements, la règle vaut pour tous les jours.</p>
          )}

          <p id={`${id}-help`} className="text-xs text-gray-600">{MEAL_HELP}</p>
        </div>
      )}
    </fieldset>
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
  if (field === "meal") return `${idPrefix}-meal-yes`
  if (field === "mealMinutes") return `${idPrefix}-meal-minutes`
  if (field === "mealWindows") return `${idPrefix}-meal-w0-start`
  if (field.startsWith("mealWindow")) return `${idPrefix}-meal-w${field.slice("mealWindow".length)}-start`
  if (field === "mealDays") return `${idPrefix}-meal-day-0`
  if (field === "travel") return `${idPrefix}-travel-yes`
  if (field === "minors") return `${idPrefix}-minors-yes`
  if (field === "travelMinutes") return `${idPrefix}-travel-minutes`
  return `${idPrefix}-${field}-hours`
}
