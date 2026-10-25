"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useState } from "react"
import { orgContactHref } from "@/lib/mission-brief"
import { KEPT_ANSWERS_NOTE, KEPT_ANSWERS_TITLE, MY_ANSWERS_TITLE, NO_ANSWER_TEXT, shownRows, startingAnswers, type KeptAnswerRow, type MyAnswerRow } from "@/lib/my-answers"
import { ORG_CONTACT_LABEL } from "@/lib/shift-info"
import { checkAnswers, visibleQuestions, type Question } from "@/lib/event-questions"
import {
  ANSWERS_SAVED_TEXT, ANSWERS_SAVE_FAILED_TEXT, ANSWERS_UNCHANGED_TEXT, EDIT_ANSWERS_LABEL, answersClosedText,
  type AnswersEditState,
} from "@/lib/answer-changes"
import { announce } from "@/lib/announce"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import type { SelfCancelReason } from "@/lib/cancel-deadline"
import SignupQuestions, { type Answers } from "./SignupQuestions"

const linkCls = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const EDIT_BUTTON_ID = "my-answers-edit"
const FORM_ID = "my-answers-form"
const FORM_TITLE_ID = "my-answers-form-title"
const CLOSED_ID = "my-answers-closed"

const asQuestions = (rows: MyAnswerRow[]): Question[] => rows.map((r) => ({ id: r.id, label: r.label, type: r.type, options: r.options, required: r.required, minValue: r.minValue, maxValue: r.maxValue, parentId: r.parentId, showIfValues: r.showIfValues }))

/** The field a question's focus goes to: the text field, the checked choice, or the first one. */
function fieldOf(id: string): () => HTMLElement | null {
  return () => document.getElementById(`q-${id}`)
    ?? document.querySelector<HTMLElement>(`input[name="q-${id}"]:checked`)
    ?? document.getElementById(`q-${id}-0`)
}

/**
 * « Mes réponses » (#984), under the registrations of the personal page: each question of the
 * sign-up form with the volunteer's answer. While the volunteer can still withdraw online (same
 * lock, #946), « Modifier mes réponses » opens the sign-up form's fields in place, with
 * « Enregistrer » and « Annuler »; afterwards, the organisation's email to ask for a change.
 * Focus: the first field on open, the button back on save or cancel, the first refused field on an
 * error; the result is said by a status line that stays mounted. Below, closed by default, the
 * answers kept for questions no longer asked to the volunteer (#1140, postes they left), read-only.
 * Nothing when the event asks them no question and nothing is kept.
 */
export default function MyAnswersCard({ rows: initialRows, kept = [], edit: initialEdit, token, contactEmail, eventTitle }: {
  rows: MyAnswerRow[]
  /** Answers kept for questions of postes the volunteer no longer holds (#1140), never editable here. */
  kept?: KeptAnswerRow[]
  /** Whether the answers can still change online; absent means not (an older answer). */
  edit?: AnswersEditState
  token: string
  contactEmail: string | null
  eventTitle: string
}) {
  const [rows, setRows] = useState(initialRows)
  const [closedReason, setClosedReason] = useState<SelfCancelReason | null>(initialEdit?.allowed ? null : (initialEdit?.reason ?? "ended"))
  // A save refused because editing closed meanwhile: said in the closed note, which takes focus.
  const [notSaved, setNotSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [failure, setFailure] = useState("")
  // Focus to move once React has committed the render it goes with; `after` runs once it moved.
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[]; after?: () => void } | null>(null)
  useLayoutEffect(() => {
    if (!focusRequest) return
    focusFirstAvailable(focusRequest.candidates)
    focusRequest.after?.()
  }, [focusRequest])

  if (rows.length === 0 && kept.length === 0) return null

  function open() {
    setAnswers(startingAnswers(rows))
    setErrors(new Map())
    setFailure("")
    setStatus("")
    setEditing(true)
    setFocusRequest({ candidates: [fieldOf(rows[0].id)] })
  }

  function close(after?: () => void) {
    setEditing(false)
    setErrors(new Map())
    setFailure("")
    setFocusRequest({ candidates: [() => document.getElementById(EDIT_BUTTON_ID)], after })
  }

  /** Marks the refused fields and puts focus on the first; their message is read with the field. */
  function refuse(list: { questionId: string; message: string }[]) {
    setErrors(new Map(list.map((e) => [e.questionId, e.message])))
    // Only a field on screen: a follow-up (#1016) hidden by its parent's answer has none.
    const shown = visibleQuestions(asQuestions(rows), answers)
    const first = list.find((e) => shown.some((r) => r.id === e.questionId))
    const target = first ? fieldOf(first.questionId) : () => document.getElementById(`${FORM_ID}-submit`)
    // Focus already there (Enter in the refused field): moving it would voice nothing, the alert does.
    const already = target() === document.activeElement
    setFocusRequest({ candidates: [target], after: already ? () => announce(setFailure, (first ?? list[0])?.message ?? ANSWERS_SAVE_FAILED_TEXT) : undefined })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    // aria-disabled does not stop Enter in a text field: the request in flight wins.
    if (saving) return
    setFailure("")
    const check = checkAnswers(asQuestions(rows), answers)
    if (!check.ok) return refuse(check.errors)
    setErrors(new Map())
    setSaving(true)
    let body: { answers?: MyAnswerRow[]; changed?: number; error?: string; questionErrors?: unknown; reason?: SelfCancelReason } = {}
    let statusCode = 0
    try {
      const res = await fetch(`/api/public/registrations/${token}/answers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      statusCode = res.status
      body = await res.json().catch(() => ({}))
    } catch {
      statusCode = 0
    }
    setSaving(false)

    if (statusCode === 200 && Array.isArray(body.answers)) {
      setRows(body.answers)
      const text = body.changed ? ANSWERS_SAVED_TEXT : ANSWERS_UNCHANGED_TEXT
      // Focus back on the button first, then the status: a move announced after it would cut it.
      close(() => announce(setStatus, text))
      return
    }
    if (statusCode === 400 && Array.isArray(body.questionErrors)) {
      const list = body.questionErrors.filter((x): x is { questionId: string; message: string } => typeof x?.questionId === "string" && typeof x?.message === "string")
      if (list.some((x) => rows.some((r) => r.id === x.questionId))) return refuse(list)
    }
    if (statusCode === 409) {
      // Too late meanwhile (the page was loaded earlier): the form goes, the note says so.
      setEditing(false)
      setNotSaved(true)
      setClosedReason(body.reason ?? "deadline")
      setFocusRequest({ candidates: [() => document.getElementById(CLOSED_ID)] })
      return
    }
    // Rate limit, network, server error: the typed answers stay, the alert says what to do.
    announce(setFailure, statusCode === 429 && body.error ? body.error : ANSWERS_SAVE_FAILED_TEXT)
  }

  const closedNote = closedReason && (
    <div id={CLOSED_ID} tabIndex={-1} className="text-sm text-gray-700 space-y-1 focus:outline-none">
      <p>
        {notSaved && <>Tes modifications n&apos;ont pas été enregistrées. </>}
        {answersClosedText(closedReason)}
      </p>
      {contactEmail && (
        <p>
          Pour changer une réponse, écris à l&apos;organisation :{" "}
          <a href={orgContactHref(contactEmail, eventTitle)} className={linkCls}>{ORG_CONTACT_LABEL}</a>.
        </p>
      )}
    </div>
  )

  return (
    <section aria-labelledby="my-answers-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 id="my-answers-title" className="text-sm font-semibold text-gray-900">{MY_ANSWERS_TITLE}</h2>
        <p className="text-sm text-gray-700 mt-0.5">
          {editing ? "Modifie tes réponses, puis enregistre." : rows.length > 0 ? "Ce que tu as répondu aux questions de l’inscription." : "Aucune question ne concerne tes créneaux actuels."}
        </p>
      </div>
      {editing ? (
        <form id={FORM_ID} aria-labelledby={FORM_TITLE_ID} noValidate onSubmit={save} className="space-y-4">
          <p id={FORM_TITLE_ID} className="sr-only">{EDIT_ANSWERS_LABEL}</p>
          <SignupQuestions questions={asQuestions(rows)} answers={answers} onChange={(id, v) => { if (!saving) setAnswers((a) => ({ ...a, [id]: v })) }} errors={errors} clearable />
          {/* Always mounted, so a second identical failure is voiced again (announce). */}
          <p role="alert" className={failure ? "text-sm text-red-700" : "sr-only"}>{failure}</p>
          <div className="flex flex-wrap gap-2">
            <button
              id={`${FORM_ID}-submit`}
              type="submit"
              aria-disabled={saving || undefined}
              className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-700 aria-disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => { if (!saving) close() }}
              aria-disabled={saving || undefined}
              className="border border-blue-600 text-blue-600 rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Annuler
            </button>
          </div>
        </form>
      ) : rows.length === 0 ? null : (
        <>
          <dl className="space-y-2 text-sm text-gray-800">
            {/* A follow-up (#1016) only when the answer to its parent shows it, set in under it. */}
            {shownRows(rows).map((row) => (
              <div key={row.id} className={row.parentId ? "pl-5 sm:pl-6" : undefined}>
                <dt className="font-medium text-gray-900 break-words">{row.label}</dt>
                <dd className="break-words">{row.answer ?? <span className="italic text-gray-600">{NO_ANSWER_TEXT}</span>}</dd>
              </div>
            ))}
          </dl>
          {closedReason ? closedNote : (
            <button
              id={EDIT_BUTTON_ID}
              type="button"
              onClick={open}
              className="border border-blue-600 text-blue-600 rounded-xl px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {EDIT_ANSWERS_LABEL}
            </button>
          )}
        </>
      )}
      {!editing && kept.length > 0 && (
        <details className="text-sm text-gray-800">
          <summary className="cursor-pointer font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            {KEPT_ANSWERS_TITLE} ({kept.length})
          </summary>
          <p className="text-gray-700 mt-2">{KEPT_ANSWERS_NOTE}</p>
          <dl className="space-y-2 mt-2">
            {kept.map((row) => (
              <div key={row.id}>
                <dt className="font-medium text-gray-900 break-words">{row.label}</dt>
                <dd className="break-words">{row.answer}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {/* The result of a save: visible, outside the form/list swap, so it stays mounted. */}
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
    </section>
  )
}
