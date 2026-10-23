"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import FormStatus from "@/components/FormStatus"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { useSubmit } from "@/lib/use-submit"
import { NUMBER_ANSWER_MAX, QUESTION_LIMIT, QUESTION_TYPE_LABEL, QUESTION_TYPES, formOrder, numberRangeText, parentChoices, parseWholeNumber, type QuestionType } from "@/lib/event-questions"
import {
  ALWAYS_LABEL, FOLLOW_UP_HINT, FOLLOW_UP_LABEL, FOLLOW_UP_LOCKED_HINT, FOLLOW_UP_VALUES_LEGEND, HAS_FOLLOW_UPS_HINT, NO_PARENT_HINT, VALUES_EMPTY,
  canMove, followUpErrorField, followUpText, moveInGroups, moveStatus, parentCandidates, removalLines,
} from "@/lib/question-follow-up"
import { NO_ROLES_HINT, QUESTION_ROLE_HINT, QUESTION_ROLE_LABEL, questionErrorField, questionRoleOptions, questionRoleText, type QuestionRoleChoice } from "@/lib/question-role"
import RequiredMark from "@/components/RequiredMark"

type Q = { id: string; label: string; type: string; options: string[]; required: boolean; minValue?: number | null; maxValue?: number | null; roleName: string | null; parentId?: string | null; showIfValues?: string[]; answers: number }
type Draft = { label: string; type: QuestionType; options: string; required: boolean; min: string; max: string; roleName: string; parentId: string; showIf: string[] }
const EMPTY: Draft = { label: "", type: "text", options: "", required: false, min: "", max: "", roleName: "", parentId: "", showIf: [] }
const isChoice = (t: string) => t === "single" || t === "multiple"

/**
 * Edit the custom questions of an event's sign-up form (#483), each optionally attached to one of
 * the event's postes (`roles`, #984 part 3) so a change of its answer reaches that poste's leaders,
 * and optionally shown only for some answers of another question (a follow-up, #1016): listed in
 * a nested list under its parent, moved with it, removed with it.
 */
export default function QuestionsEditor({ eventId, initialQuestions, roles = [] }: { eventId: string; initialQuestions: Q[]; roles?: QuestionRoleChoice[] }) {
  const [questions, setQuestions] = useState(() => formOrder(initialQuestions))
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
  // The answers summary below (#686) is server-rendered: refreshed after each change of the list.
  const router = useRouter()

  function open(q: Q | null, trigger: HTMLElement) {
    triggerRef.current = trigger
    editor.reset()
    list.reset()
    setEditing(q ? q.id : "new")
    setDraft(q ? { label: q.label, type: q.type as QuestionType, options: q.options.join("\n"), required: q.required, min: q.minValue ? String(q.minValue) : "", max: q.maxValue == null ? "" : String(q.maxValue), roleName: q.roleName ?? "", parentId: q.parentId ?? "", showIf: q.showIfValues ?? [] } : EMPTY)
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
    // Bounds of a number question (#1015): whole numbers 0 or more, empty for none; the server checks again.
    const isNumber = draft.type === "number"
    const minValue = isNumber ? parseWholeNumber(draft.min) : null
    const maxValue = isNumber ? parseWholeNumber(draft.max) : null
    if (isNumber) {
      const bad = (n: number | null) => n !== null && (Number.isNaN(n) || n < 0 || n > NUMBER_ANSWER_MAX)
      if (bad(minValue)) { editor.fail(`Le minimum doit être un nombre entier entre 0 et ${NUMBER_ANSWER_MAX}.`, "min", document.getElementById(`${id}-min`)); return }
      if (bad(maxValue)) { editor.fail(`Le maximum doit être un nombre entier entre 0 et ${NUMBER_ANSWER_MAX}.`, "max", document.getElementById(`${id}-max`)); return }
      if (maxValue !== null && maxValue < (minValue ?? 0)) { editor.fail(`Le maximum doit être égal ou supérieur au minimum (${minValue ?? 0}).`, "max", document.getElementById(`${id}-max`)); return }
    }
    // A follow-up (#1016) needs at least one answer of its parent that shows it.
    if (draft.parentId && draft.showIf.length === 0) { editor.fail(VALUES_EMPTY, "showif", document.getElementById(`${id}-showif-0`)); return }
    const isNew = editing === "new"
    const outcome = await editor.submit<Q & { _count: { answers: number } }>(() => fetch(isNew ? base : `${base}/${editing}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: draft.label, type: draft.type, options, required: draft.required, minValue, maxValue, roleName: draft.roleName || null, parentId: draft.parentId || null, showIfValues: draft.parentId ? draft.showIf : [] }),
    }), { fallback: "Impossible d'enregistrer la question.", silent: true })
    if (!outcome.ok) {
      // A refused poste marks and focuses its field; any other refusal is shown as before.
      if (outcome.error) {
        const field = questionErrorField(outcome.error) ?? followUpErrorField(outcome.error)
        editor.fail(outcome.error, field ?? undefined, field ? document.getElementById(field === "showif" ? `${id}-showif-0` : `${id}-${field}`) : undefined)
      }
      return
    }
    const saved = { id: outcome.data.id, label: outcome.data.label, type: outcome.data.type, options: outcome.data.options, required: outcome.data.required, minValue: outcome.data.minValue ?? null, maxValue: outcome.data.maxValue ?? null, roleName: outcome.data.roleName ?? null, parentId: outcome.data.parentId ?? null, showIfValues: outcome.data.showIfValues ?? [], answers: outcome.data._count.answers }
    // A follow-up takes its place right after its parent, as the server put it.
    const before = isNew ? null : questions.find((q) => q.id === saved.id)
    setQuestions((prev) => formOrder(isNew ? [...prev, saved] : prev.map((q) => (q.id === saved.id ? saved : q))))
    const parent = saved.parentId && saved.parentId !== before?.parentId ? questions.find((q) => q.id === saved.parentId) : null
    const placed = parent ? ` Elle est placée après « ${parent.label} ».` : ""
    list.setStatus(isNew ? `Question « ${saved.label} » ajoutée.${placed}` : `Question « ${saved.label} » enregistrée.${placed}`)
    close()
    router.refresh()
  }

  /**
   * Moves a question up or down (#483): a question with follow-ups moves with them, over the whole
   * previous or next block; a follow-up only among its parent's follow-ups (#1016).
   */
  async function move(q: Q, delta: -1 | 1, trigger: HTMLElement) {
    const next = moveInGroups(questions, q.id, delta)
    if (list.busy || !next) return
    const outcome = await list.submit(() => fetch(`${base}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((x) => x.id) }) }), { fallback: "Impossible de changer l'ordre." })
    if (!outcome.ok) return
    setQuestions(next)
    router.refresh()
    list.setStatus(moveStatus(q.label, next.filter((x) => x.parentId === q.id).length, next.findIndex((x) => x.id === q.id) + 1, next.length))
    // The button moved with its row: keep the focus on the same action of the same question.
    const kind = trigger.dataset.move
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-move="${kind}"][data-q="${q.id}"]`)?.focus())
  }

  async function remove(q: Q) {
    const outcome = await list.submit<{ archived: boolean; followUps?: { id: string; label: string }[] }>(() => fetch(`${base}/${q.id}`, { method: "DELETE" }), { fallback: "Impossible de retirer la question.", silent: true })
    if (!outcome.ok) return
    // Its follow-ups (#1016) went with it.
    const gone = new Set([q.id, ...(outcome.data.followUps ?? []).map((f) => f.id)])
    setPendingDelete(null)
    if (editing && gone.has(editing)) setEditing(null)
    setQuestions((prev) => prev.filter((x) => !gone.has(x.id) && !(x.parentId && gone.has(x.parentId))))
    const removedFollowUps = (outcome.data.followUps ?? []).length
    const also = removedFollowUps > 1 ? ` Ses ${removedFollowUps} questions de suivi sont retirées aussi.` : removedFollowUps === 1 ? " Sa question de suivi est retirée aussi." : ""
    list.setStatus((outcome.data.archived ? `Question « ${q.label} » retirée du formulaire ; ses réponses restent dans les exports.` : `Question « ${q.label} » supprimée.`) + also)
    headingRef.current?.focus()
    router.refresh()
  }

  const full = questions.length >= QUESTION_LIMIT
  const answered = editing && editing !== "new" ? (questions.find((q) => q.id === editing)?.answers ?? 0) : 0
  const roleOptions = questionRoleOptions(roles, editing && editing !== "new" ? questions.find((q) => q.id === editing)?.roleName : null)
  // The follow-up's condition (#1016): which questions can show it, and what it may still change.
  const editingId = editing && editing !== "new" ? editing : null
  const current = editingId ? questions.find((q) => q.id === editingId) : undefined
  const hasFollowUps = !!editingId && questions.some((q) => q.parentId === editingId)
  const candidates = parentCandidates(questions, editingId)
  // Once answered, a follow-up keeps its parent (it may be asked to everyone); an answered question
  // asked to everyone can't become a follow-up.
  const parentOptions = answered > 0 ? candidates.filter((c) => c.id === current?.parentId) : candidates
  const parentLocked = answered > 0 && !current?.parentId
  const chosenParent = questions.find((q) => q.id === draft.parentId)
  const followUpsOf = (q: Q) => questions.filter((x) => x.parentId === q.id)
  const describedBy = (field: string, extra: string) => [extra, editor.invalidField === field ? `${id}-editor-error` : null].filter(Boolean).join(" ") || undefined

  /** One question of the list: its label, its details, and its actions. */
  function row(q: Q) {
    const condition = followUpText(q, questions)
    const up = canMove(questions, q.id, -1)
    const down = canMove(questions, q.id, 1)
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 break-words">{q.label}{q.required ? " (obligatoire)" : ""}</p>
          <p className="text-xs text-gray-700 break-words">
            {QUESTION_TYPE_LABEL[q.type as QuestionType] ?? q.type}
            {isChoice(q.type) ? ` : ${q.options.join(", ")}` : ""}
            {q.type === "number" ? ` : ${numberRangeText(q)}` : ""}
            {` · ${q.answers} réponse${q.answers > 1 ? "s" : ""}`}
            {q.roleName ? ` · ${questionRoleText(q.roleName)}` : ""}
          </p>
          {condition && <p className="text-xs text-gray-700 break-words">Question de suivi · {condition}</p>}
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0 justify-end">
          <button type="button" data-move="up" data-q={q.id} onClick={(e) => void move(q, -1, e.currentTarget)} aria-disabled={!up || undefined} className={`text-xs font-medium text-gray-700 hover:text-gray-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${!up ? "opacity-50 cursor-not-allowed" : ""}`}>
            Monter{" "}<span className="sr-only">« {q.label} »</span>
          </button>
          <button type="button" data-move="down" data-q={q.id} onClick={(e) => void move(q, 1, e.currentTarget)} aria-disabled={!down || undefined} className={`text-xs font-medium text-gray-700 hover:text-gray-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${!down ? "opacity-50 cursor-not-allowed" : ""}`}>
            Descendre{" "}<span className="sr-only">« {q.label} »</span>
          </button>
          <button type="button" onClick={(e) => open(q, e.currentTarget)} className="text-xs font-medium text-blue-700 hover:text-blue-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            Modifier{" "}<span className="sr-only">la question « {q.label} »</span>
          </button>
          <button type="button" onClick={(e) => { triggerRef.current = e.currentTarget; list.reset(); setPendingDelete(q) }} className="text-xs font-medium text-red-700 hover:text-red-900 rounded px-1 py-1 min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
            Retirer{" "}<span className="sr-only">la question « {q.label} »</span>
          </button>
        </div>
      </div>
    )
  }

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
            {questions.filter((q) => !q.parentId || !questions.some((p) => p.id === q.parentId)).map((q) => (
              <li key={q.id} className="px-4 py-3">
                {row(q)}
                {/* Its follow-ups (#1016): a nested list, so the dependency is in the structure too. */}
                {followUpsOf(q).length > 0 && (
                  <ol role="list" className="mt-3 pl-6 space-y-3">
                    {followUpsOf(q).map((f) => <li key={f.id}>{row(f)}</li>)}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {pendingDelete && (
        <ConfirmActionModal
          recap={{
            title: `Retirer la question « ${pendingDelete.label} » ?`,
            lines: removalLines(pendingDelete, followUpsOf(pendingDelete)),
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
          <p aria-hidden="true" className="text-xs text-gray-600">Les champs marqués d&apos;un astérisque (*) sont obligatoires.</p>
          <div>
            <label htmlFor={`${id}-label`} className="block text-sm font-medium text-gray-800 mb-1">Question posée aux bénévoles<RequiredMark /></label>
            <input id={`${id}-label`} type="text" required maxLength={120} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} aria-invalid={editor.isInvalid("label")} aria-describedby={describedBy("label", `${id}-label-hint`)} className="input" placeholder="ex. Taille de t-shirt" />
            <p id={`${id}-label-hint`} className="text-xs text-gray-600 mt-1">Seulement le nécessaire, rien de sensible (santé, religion, opinions…).</p>
          </div>
          <div>
            <label htmlFor={`${id}-type`} className="block text-sm font-medium text-gray-800 mb-1">Type de réponse</label>
            <select id={`${id}-type`} value={draft.type} onChange={(e) => {
              // Leaving « Nombre » removes its fields: no error may stay tied to them.
              if (editor.invalidField === "min" || editor.invalidField === "max") editor.reset()
              setDraft((d) => ({ ...d, type: e.target.value as QuestionType }))
            }} disabled={answered > 0} aria-describedby={[answered > 0 ? `${id}-type-locked` : null, hasFollowUps ? `${id}-type-parent` : null].filter(Boolean).join(" ") || undefined} className="input">
              {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
            </select>
            {answered > 0 && <p id={`${id}-type-locked`} className="text-xs text-gray-600 mt-1">Cette question a déjà des réponses : son type ne peut plus changer.</p>}
            {hasFollowUps && <p id={`${id}-type-parent`} className="text-xs text-gray-600 mt-1">Cette question a une question de suivi : elle reste une question Oui / non ou à choix, et garde les choix qui l&apos;affichent.</p>}
          </div>
          {isChoice(draft.type) && (
            <div>
              <label htmlFor={`${id}-options`} className="block text-sm font-medium text-gray-800 mb-1">Choix proposés<RequiredMark /></label>
              <textarea id={`${id}-options`} rows={4} required value={draft.options} onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))} aria-invalid={editor.isInvalid("options")} aria-describedby={describedBy("options", `${id}-options-hint`)} className="input" />
              <p id={`${id}-options-hint`} className="text-xs text-gray-600 mt-1">Un choix par ligne, au moins deux, douze au plus.{answered > 0 ? " Les choix déjà retenus par des bénévoles ne peuvent pas être retirés." : ""}</p>
            </div>
          )}
          {draft.type === "number" && (
            <fieldset>
              <legend className="block text-sm font-medium text-gray-800 mb-1">Valeurs acceptées</legend>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor={`${id}-min`} className="block text-sm text-gray-800 mb-1">Minimum <span className="text-gray-600">(facultatif)</span></label>
                  <input id={`${id}-min`} type="text" inputMode="numeric" autoComplete="off" value={draft.min} onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value }))} aria-invalid={editor.isInvalid("min")} aria-describedby={describedBy("min", `${id}-bounds-hint`)} className="input w-32 tabular-nums" />
                </div>
                <div>
                  <label htmlFor={`${id}-max`} className="block text-sm text-gray-800 mb-1">Maximum <span className="text-gray-600">(facultatif)</span></label>
                  <input id={`${id}-max`} type="text" inputMode="numeric" autoComplete="off" value={draft.max} onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))} aria-invalid={editor.isInvalid("max")} aria-describedby={describedBy("max", `${id}-bounds-hint`)} className="input w-32 tabular-nums" />
                </div>
              </div>
              <p id={`${id}-bounds-hint`} className="text-xs text-gray-600 mt-1">Nombres entiers, 0 ou plus. Sans minimum, les réponses partent de 0 ; sans maximum, pas de limite. La synthèse additionne les réponses.{answered > 0 ? " Les nombres déjà donnés par des bénévoles doivent rester acceptés." : ""}</p>
            </fieldset>
          )}
          <div className="flex items-center gap-2">
            <input id={`${id}-required`} type="checkbox" checked={draft.required} onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))} className="h-4 w-4 rounded border-gray-500" />
            <label htmlFor={`${id}-required`} className="text-sm text-gray-800">Réponse obligatoire</label>
          </div>
          {hasFollowUps ? (
            <p className="text-xs text-gray-600">{HAS_FOLLOW_UPS_HINT}</p>
          ) : candidates.length === 0 && !draft.parentId ? (
            <p className="text-xs text-gray-600">{NO_PARENT_HINT}</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor={`${id}-parent`} className="block text-sm font-medium text-gray-800 mb-1">{FOLLOW_UP_LABEL}</label>
                <select
                  id={`${id}-parent`}
                  value={draft.parentId}
                  disabled={parentLocked}
                  onChange={(e) => {
                    if (editor.invalidField === "parent" || editor.invalidField === "showif") editor.reset()
                    // Another parent has other answers: none ticked until chosen again.
                    setDraft((d) => ({ ...d, parentId: e.target.value, showIf: [] }))
                  }}
                  aria-invalid={editor.isInvalid("parent")}
                  aria-describedby={describedBy("parent", parentLocked ? `${id}-parent-locked` : `${id}-parent-hint`)}
                  className="input"
                >
                  <option value="">{ALWAYS_LABEL}</option>
                  {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {parentLocked
                  ? <p id={`${id}-parent-locked`} className="text-xs text-gray-600 mt-1">{FOLLOW_UP_LOCKED_HINT}</p>
                  : <p id={`${id}-parent-hint`} className="text-xs text-gray-600 mt-1">{FOLLOW_UP_HINT}</p>}
              </div>
              {chosenParent && (
                <fieldset>
                  <legend className="block text-sm font-medium text-gray-800 mb-1">{FOLLOW_UP_VALUES_LEGEND}<RequiredMark /></legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {parentChoices(chosenParent).map((c, i) => (
                      <label key={c} htmlFor={`${id}-showif-${i}`} className="flex items-center gap-2 text-sm text-gray-800 min-h-8">
                        <input
                          id={`${id}-showif-${i}`}
                          type="checkbox"
                          checked={draft.showIf.includes(c)}
                          onChange={(e) => setDraft((d) => ({ ...d, showIf: e.target.checked ? [...d.showIf, c] : d.showIf.filter((v) => v !== c) }))}
                          aria-invalid={editor.isInvalid("showif")}
                          aria-describedby={editor.invalidField === "showif" ? `${id}-editor-error` : undefined}
                          className="h-4 w-4 rounded border-gray-500"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}
          {roleOptions.length > 1 ? (
            <div>
              <label htmlFor={`${id}-role`} className="block text-sm font-medium text-gray-800 mb-1">{QUESTION_ROLE_LABEL}</label>
              <select id={`${id}-role`} value={draft.roleName} onChange={(e) => setDraft((d) => ({ ...d, roleName: e.target.value }))} aria-invalid={editor.isInvalid("role")} aria-describedby={describedBy("role", `${id}-role-hint`)} className="input">
                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p id={`${id}-role-hint`} className="text-xs text-gray-600 mt-1">{QUESTION_ROLE_HINT}</p>
            </div>
          ) : (
            <p className="text-xs text-gray-600">{NO_ROLES_HINT}</p>
          )}
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
