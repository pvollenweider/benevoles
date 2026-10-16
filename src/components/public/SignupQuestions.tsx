"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { Fragment } from "react"
import { NO, TEXT_ANSWER_MAX, YES, numberHint, visibleQuestions, type Question } from "@/lib/event-questions"
import RequiredMark from "@/components/RequiredMark"

export type Answers = Record<string, string | string[]>

/** The choice that clears an optional answer, on the personal page (`clearable`). */
export const NO_ANSWER_CHOICE = "Pas de réponse"

/**
 * The event's custom questions on the sign-up form (#483): labelled fields, choices grouped in
 * fieldsets, required ones marked, errors tied to their field. The server checks everything again.
 * A follow-up question (#1016) is shown right after its parent, set in, only while the parent's
 * answer shows it: no focus move and no announcement (arrowing through radios would repeat it),
 * the next Tab or reading step reaches it. Hidden, it is neither required nor sent as needed.
 */
export default function SignupQuestions({ questions, answers, onChange, errors, clearable = false }: {
  questions: Question[]
  answers: Answers
  onChange: (id: string, value: string | string[]) => void
  /** The last check's message per refused question, shown under it and read with its fields. */
  errors: Map<string, string>
  /**
   * A « Pas de réponse » choice for an optional yes/no or single-choice question (#984): a radio
   * can't be unchecked, so changing an answer from the personal page needs a way back to none.
   */
  clearable?: boolean
}) {
  if (questions.length === 0) return null
  // The « * » is decorative (#1003): a text field and a radio group say « obligatoire » through
  // `required`; a checkbox group has no such state (required on each box would demand all of them),
  // so its legend says it in visible words: « (un choix ou plus) » instead of « (plusieurs choix
  // possibles) ».
  const star = (q: Question) => (q.required ? <RequiredMark /> : null)
  const optional = (q: Question) => (q.required ? null : <>{" "}<span className="text-gray-500 font-normal">(facultatif)</span></>)
  return (
    <>
      {visibleQuestions(questions, answers).map((q) => {
        const field = renderField(q)
        // Set in under its parent; a sibling, not inside the parent's fieldset, whose legend would
        // be read again with each of its fields.
        return q.parentId
          ? <div key={q.id} data-follow-up className="pl-5 sm:pl-6">{field}</div>
          : <Fragment key={q.id}>{field}</Fragment>
      })}
    </>
  )

  function renderField(q: Question) {
        const fieldId = `q-${q.id}`
        const message = errors.get(q.id)
        const bad = !!message
        const aria = { "aria-invalid": bad || undefined, "aria-describedby": bad ? `${fieldId}-error` : undefined }
        const errorLine = bad ? <p id={`${fieldId}-error`} className="text-xs text-red-700 mt-1">{message}</p> : null
        if (q.type === "text") {
          return (
            <div key={q.id}>
              <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">{q.label}{star(q)}{optional(q)}</label>
              <input id={fieldId} type="text" maxLength={TEXT_ANSWER_MAX} required={q.required} value={(answers[q.id] as string) ?? ""} onChange={(e) => onChange(q.id, e.target.value)} {...aria} className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${bad ? "border-red-600" : "border-gray-300"}`} />
              {errorLine}
            </div>
          )
        }
        if (q.type === "number") {
          // A whole number (#1015): a text field with the phones' numeric keypad, not type="number"
          // (no wheel or arrow changes, nothing silently dropped), and no pattern: the server's
          // message, tied to the field, says what is wrong. The range hint is always read with it.
          const hintId = `${fieldId}-hint`
          return (
            <div key={q.id}>
              <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">{q.label}{star(q)}{optional(q)}</label>
              <input
                id={fieldId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required={q.required}
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-invalid={bad || undefined}
                aria-describedby={[hintId, bad ? `${fieldId}-error` : null].filter(Boolean).join(" ")}
                className={`w-full sm:w-40 border rounded-xl px-3 py-3 text-sm tabular-nums focus:outline-hidden focus:ring-2 focus:ring-blue-500 ${bad ? "border-red-600" : "border-gray-300"}`}
              />
              <p id={hintId} className="text-xs text-gray-600 mt-1">{numberHint(q)}</p>
              {errorLine}
            </div>
          )
        }
        const multiple = q.type === "multiple"
        const choices = q.type === "yesno" ? [YES, NO] : q.options
        // "" is « no answer » for the server's check, as an untouched radio group.
        const withNone = clearable && !multiple && !q.required
        const current = answers[q.id]
        return (
          <fieldset key={q.id} className={bad ? "rounded-xl border border-red-600 p-2" : ""}>
            <legend className="block text-sm font-medium text-gray-700 mb-1">{q.label}{star(q)}{optional(q)}{multiple && <>{" "}<span className="text-gray-500 font-normal">{q.required ? "(un choix ou plus)" : "(plusieurs choix possibles)"}</span></>}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {[...choices, ...(withNone ? [""] : [])].map((c, i) => {
                const checked = multiple ? Array.isArray(current) && current.includes(c) : c === "" ? !current : current === c
                return (
                  <label key={c || "none"} htmlFor={`${fieldId}-${i}`} className="flex items-center gap-2 text-sm text-gray-800 min-h-8">
                    <input
                      id={`${fieldId}-${i}`}
                      type={multiple ? "checkbox" : "radio"}
                      name={fieldId}
                      value={c}
                      checked={checked}
                      required={q.required && !multiple}
                      {...aria}
                      onChange={(e) => {
                        if (!multiple) return onChange(q.id, c)
                        const list = Array.isArray(current) ? current : []
                        onChange(q.id, e.target.checked ? [...list, c] : list.filter((x) => x !== c))
                      }}
                      className="h-4 w-4 border-gray-300 text-blue-600"
                    />
                    {c || NO_ANSWER_CHOICE}
                  </label>
                )
              })}
            </div>
            {errorLine}
          </fieldset>
        )
  }
}
