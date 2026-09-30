"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import FormStatus from "@/components/FormStatus"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { useSubmit } from "@/lib/use-submit"
import { QUESTION_LIMIT, QUESTION_TYPE_LABEL, QUESTION_TYPES, type QuestionType } from "@/lib/event-questions"

type Q = { id: string; label: string; type: string; options: string[]; required: boolean; answers: number }
type Draft = { label: string; type: QuestionType; options: string; required: boolean }
const EMPTY: Draft = { label: "", type: "text", options: "", required: false }
const isChoice = (t: string) => t === "single" || t === "multiple"

/** Edit the custom questions of an event's sign-up form (#483). */
export default function QuestionsEditor({ eventId, initialQuestions }: { eventId: string; initialQuestions: Q[] }) {
  const [questions, setQuestions] = useState(initialQuestions)
  const [editing, setEditing] = useState<string | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [pendingDelete, setPendingDelete] = useState<Q | null>(null)
  const id = useId()
  const list = useSubmit()
  const editor = useSubmit()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const base = `/api/admin/events/${eventId}/questions`

  function open(q: Q | null, trigger: HTMLElement) {
    triggerRef.current = trigger
    editor.reset()
    list.reset()
    setEditing(q ? q.id : "new")
    setDraft(q ? { label: q.label, type: q.type as QuestionType, options: q.options.join("\n"), required: q.required } : EMPTY)
    requestAnimationFrame(() => document.getElementById(`${id}-label`)?.focus())
  }

  function close() {
    setEditing(null)
    requestAnimationFrame(() => (triggerRef.current?.isConnected ? triggerRef.current : addRef.current)?.focus())
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (editor.busy || !editing) return
    const options = draft.options.split("\n").map((o) => o.trim()).filter(Boolean)
    if (!draft.label.trim()) { editor.fail("La question est obligatoire.", "label", document.getElementById(`${id}-label`)); return }
    if (isChoice(draft.type) && options.length < 2) { editor.fail("Donnez au moins deux choix, un par ligne.", "options", document.getElementById(`${id}-options`)); return }
    const isNew = editing === "new"
    const outcome = await editor.submit<Q & { _count: { answers: number } }>(() => fetch(isNew ? base : `${base}/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: draft.label, type: draft.type, options, required: draft.required }),
    }), { fallback: "Impossible d'enregistrer la question." })
    if (!outcome.ok) return
    const saved = { id: outcome.data.id, label: outcome.data.label, type: outcome.data.type, options: outcome.data.options, required: outcome.data.required, answers: outcome.data._count.answers }
    setQuestions((prev) => (isNew ? [...prev, saved] : prev.map((q) => (q.id === saved.id ? saved : q))))
    list.setStatus(isNew ? `Question « ${saved.label} » ajoutée.` : `Question « ${saved.label} » enregistrée.`)
    close()
  }

  async function move(index: number, delta: -1 | 1, trigger: HTMLElement) {
    const target = index + delta
    if (list.busy || target < 0 || target >= questions.length) return
    const next = [...questions]
    ;[next[index], next[target]] = [next[target], next[index]]
    const outcome = await list.submit(() => fetch(`${base}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((q) => q.id) }) }), { fallback: "Impossible de changer l'ordre." })
    if (!outcome.ok) return
    setQuestions(next)
    list.setStatus(`« ${questions[index].label} » est maintenant en position ${target + 1} sur ${next.length}.`)
    // The button moved with its row: keep the focus on the same action of the same question.
    const kind = trigger.dataset.move
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move="${kind}"][data-q="${questions[index].id}"]`)?.focus())
  }

  async function remove(q: Q) {
    const outcome = await list.submit<{ archived: boolean }>(() => fetch(`${base}/${q.id}`, { method: "DELETE" }), { fallback: "Impossible de retirer la question.", silent: true })
    if (!outcome.ok) return
    setPendingDelete(null)
    if (editing === q.id) setEditing(null)
    setQuestions((prev) => prev.filter((x) => x.id !== q.id))
    list.setStatus(outcome.data.archived ? `Question « ${q.label} » retirée du formulaire ; ses réponses restent dans les exports.` : `Question « ${q.label} » supprimée.`)
    headingRef.current?.focus()
  }

  const full = questions.length >= QUESTION_LIMIT
  const answered = editing && editing !== "new" ? (questions.find((q) => q.id === editing)?.answers ?? 0) : 0
  const describedBy = (field: string, extra: string) => [extra, editor.invalidField === field ? `${id}-editor-error` : null].filter(Boolean).join(" ") || undefined

  return (
    <div className="space-y-4">
      <FormStatus status={list.status} error={pendingDelete ? null : list.error} errorId={`${id}-error`} />
      <section aria-labelledby={`${id}-list`} className="bg-white rounded-2xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <h2 id={`${id}-list`} ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-gray-800 focus:outline-none">Questions ({questions.length}/{QUESTION_LIMIT})</h2>
          <button
            ref={addRef}
            type="button"
            onClick={(e) => { if (!full) open(null, e.currentTarget) }}
            aria-disabled={full || undefined}
            aria-describedby={full ? `${id}-full` : undefined}
            className={`text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${full ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Ajouter une question
          </button>
        </div>
        {full && <p id={`${id}-full`} className="px-4 py-2 text-xs text-gray-700">{QUESTION_LIMIT} questions au plus : retirez-en une pour en ajouter une autre.</p>}
        {questions.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-700">Aucune question : le formulaire demande seulement les informations habituelles.</p>
        ) : (
          <ol role="list" className="divide-y divide-gray-100">
            {questions.map((q, i) => (
              <li key={q.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{q.label}{q.required ? " (obligatoire)" : ""}</p>
                  <p className="text-xs text-gray-700">
                    {QUESTION_TYPE_LABEL[q.type as QuestionType] ?? q.type}
                    {isChoice(q.type) ? ` : ${q.options.join(", ")}` : ""}
                    {` · ${q.answers} réponse${q.answers > 1 ? "s" : ""}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0 justify-end">
                  <button type="button" data-move="up" data-q={q.id} onClick={(e) => void move(i, -1, e.currentTarget)} aria-disabled={i === 0 || undefined} className={`text-xs font-medium text-gray-700 hover:text-gray-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${i === 0 ? "opacity-50 cursor-not-allowed" : ""}`}>
                    Monter{" "}<span className="sr-only">« {q.label} »</span>
                  </button>
                  <button type="button" data-move="down" data-q={q.id} onClick={(e) => void move(i, 1, e.currentTarget)} aria-disabled={i === questions.length - 1 || undefined} className={`text-xs font-medium text-gray-700 hover:text-gray-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${i === questions.length - 1 ? "opacity-50 cursor-not-allowed" : ""}`}>
                    Descendre{" "}<span className="sr-only">« {q.label} »</span>
                  </button>
                  <button type="button" onClick={(e) => open(q, e.currentTarget)} className="text-xs font-medium text-blue-700 hover:text-blue-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    Modifier{" "}<span className="sr-only">la question « {q.label} »</span>
                  </button>
                  <button type="button" onClick={(e) => { triggerRef.current = e.currentTarget; list.reset(); setPendingDelete(q) }} className="text-xs font-medium text-red-700 hover:text-red-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
                    Retirer{" "}<span className="sr-only">la question « {q.label} »</span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pendingDelete && (
        <ConfirmActionModal
          recap={{
            title: `Retirer la question « ${pendingDelete.label} » ?`,
            lines: pendingDelete.answers > 0
              ? [`Elle disparaît du formulaire. Ses ${pendingDelete.answers} réponse${pendingDelete.answers > 1 ? "s" : ""} restent dans les inscriptions et les exports, jusqu'à la suppression de l'événement.`]
              : ["Elle disparaît du formulaire. Personne n'y a encore répondu."],
            confirmLabel: "Retirer",
            danger: true,
          }}
          busy={list.busy}
          error={list.error}
          onConfirm={() => void remove(pendingDelete)}
          onCancel={() => { setPendingDelete(null); list.reset(); requestAnimationFrame(() => triggerRef.current?.focus()) }}
        />
      )}

      {editing && (
        <form onSubmit={save} noValidate aria-labelledby={`${id}-form-title`} className="bg-white rounded-2xl border border-blue-200 p-4 space-y-4">
          <h2 id={`${id}-form-title`} className="text-sm font-semibold text-gray-800">{editing === "new" ? "Nouvelle question" : "Modifier la question"}</h2>
          <p className="text-xs text-gray-600">Les champs marqués d&apos;un astérisque (*) sont obligatoires.</p>
          <div>
            <label htmlFor={`${id}-label`} className="block text-sm font-medium text-gray-800 mb-1">Question posée aux bénévoles *</label>
            <input id={`${id}-label`} type="text" required maxLength={120} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} aria-invalid={editor.isInvalid("label")} aria-describedby={describedBy("label", `${id}-label-hint`)} className="input" placeholder="ex. Taille de t-shirt" />
            <p id={`${id}-label-hint`} className="text-xs text-gray-600 mt-1">Seulement le nécessaire, rien de sensible (santé, religion, opinions…).</p>
          </div>
          <div>
            <label htmlFor={`${id}-type`} className="block text-sm font-medium text-gray-800 mb-1">Type de réponse</label>
            <select id={`${id}-type`} value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value as QuestionType }))} disabled={answered > 0} aria-describedby={answered > 0 ? `${id}-type-locked` : undefined} className="input">
              {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
            </select>
            {answered > 0 && <p id={`${id}-type-locked`} className="text-xs text-gray-600 mt-1">Cette question a déjà des réponses : son type ne peut plus changer.</p>}
          </div>
          {isChoice(draft.type) && (
            <div>
              <label htmlFor={`${id}-options`} className="block text-sm font-medium text-gray-800 mb-1">Choix proposés *</label>
              <textarea id={`${id}-options`} rows={4} value={draft.options} onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))} aria-invalid={editor.isInvalid("options")} aria-describedby={describedBy("options", `${id}-options-hint`)} className="input" />
              <p id={`${id}-options-hint`} className="text-xs text-gray-600 mt-1">Un choix par ligne, au moins deux, douze au plus.{answered > 0 ? " Les choix déjà retenus par des bénévoles ne peuvent pas être retirés." : ""}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input id={`${id}-required`} type="checkbox" checked={draft.required} onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
            <label htmlFor={`${id}-required`} className="text-sm text-gray-800">Réponse obligatoire</label>
          </div>
          <FormStatus error={editor.error} errorId={`${id}-editor-error`} />
          <div className="flex gap-3">
            <button type="submit" aria-disabled={editor.busy || undefined} className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${editor.busy ? "opacity-60 cursor-wait" : ""}`}>
              {editor.busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button type="button" onClick={close} className="text-sm text-gray-700 px-3 py-2 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Annuler</button>
          </div>
        </form>
      )}
    </div>
  )
}
