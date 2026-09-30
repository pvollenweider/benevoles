"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NO, TEXT_ANSWER_MAX, YES, type Question } from "@/lib/event-questions"

export type Answers = Record<string, string | string[]>

/**
 * The event's custom questions on the sign-up form (#483): labelled fields, choices grouped in
 * fieldsets, required ones marked, errors tied to their field. The server checks everything again.
 */
export default function SignupQuestions({ questions, answers, onChange, errors }: {
  questions: Question[]
  answers: Answers
  onChange: (id: string, value: string | string[]) => void
  /** The last check's message per refused question, shown under it and read with its fields. */
  errors: Map<string, string>
}) {
  if (questions.length === 0) return null
  const star = (q: Question) => (q.required ? <>{" *"}{" "}<span className="sr-only">(obligatoire)</span></> : null)
  const optional = (q: Question) => (q.required ? null : <>{" "}<span className="text-gray-500 font-normal">(facultatif)</span></>)
  return (
    <>
      {questions.map((q) => {
        const fieldId = `q-${q.id}`
        const message = errors.get(q.id)
        const bad = !!message
        const aria = { "aria-invalid": bad || undefined, "aria-describedby": bad ? `${fieldId}-error` : undefined }
        const errorLine = bad ? <p id={`${fieldId}-error`} className="text-xs text-red-700 mt-1">{message}</p> : null
        if (q.type === "text") {
          return (
            <div key={q.id}>
              <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-1">{q.label}{star(q)}{optional(q)}</label>
              <input id={fieldId} type="text" maxLength={TEXT_ANSWER_MAX} required={q.required} value={(answers[q.id] as string) ?? ""} onChange={(e) => onChange(q.id, e.target.value)} {...aria} className={`w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${bad ? "border-red-600" : "border-gray-300"}`} />
              {errorLine}
            </div>
          )
        }
        const choices = q.type === "yesno" ? [YES, NO] : q.options
        const multiple = q.type === "multiple"
        const current = answers[q.id]
        return (
          <fieldset key={q.id} className={bad ? "rounded-xl border border-red-600 p-2" : ""}>
            <legend className="block text-sm font-medium text-gray-700 mb-1">{q.label}{star(q)}{optional(q)}{multiple && <>{" "}<span className="text-gray-500 font-normal">(plusieurs choix possibles)</span></>}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {choices.map((c, i) => {
                const checked = multiple ? Array.isArray(current) && current.includes(c) : current === c
                return (
                  <label key={c} htmlFor={`${fieldId}-${i}`} className="flex items-center gap-2 text-sm text-gray-800 min-h-8">
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
                    {c}
                  </label>
                )
              })}
            </div>
            {errorLine}
          </fieldset>
        )
      })}
    </>
  )
}
