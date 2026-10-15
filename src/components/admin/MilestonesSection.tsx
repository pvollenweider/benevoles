"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId, useRef, useLayoutEffect } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { deleteMilestoneRecap } from "@/lib/action-recap"
import { focusFirstAvailable, type FocusCandidate } from "@/lib/focus-return"
import { dueDateInputValue, isMilestoneOverdue, milestoneChanges, MILESTONE_TITLE_MAX, ownerOptionLabel, ownerOptions, replaceMilestone, sortMilestones, validateMilestoneInput, type OwnerOption } from "@/lib/milestones"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import FormStatus from "@/components/FormStatus"
import { requestJson, useSubmit } from "@/lib/use-submit"

export type MilestoneRow = {
  id: string
  title: string
  dueDate: string
  done: boolean
  /** The owner (#985): an admin account of the organisation, or none. */
  ownerId: string | null
  ownerName: string | null
}

/** An active admin account of the organisation: who can be chosen as owner (#985). */
export type TeamMember = { id: string; name: string }

/** The API answers with the owner as a relation; the list keeps its id and name. */
type MilestoneResponse = Omit<MilestoneRow, "ownerName"> & { owner?: { id: string; name: string } | null }

function toRow(m: MilestoneResponse): MilestoneRow {
  return { id: m.id, title: m.title, dueDate: m.dueDate, done: m.done, ownerId: m.ownerId ?? null, ownerName: m.owner?.name ?? null }
}

// The due day as picked (stored at midnight UTC), whatever the browser's zone.
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
}

const primaryButton =
  "inline-flex items-center min-h-9 border border-transparent bg-blue-600 text-white px-4 py-1.5 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-50 aria-disabled:cursor-wait transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const quietButton =
  "inline-flex items-center min-h-9 text-sm font-medium border border-gray-300 text-gray-800 px-3 py-1.5 rounded-xl hover:bg-gray-100 aria-disabled:opacity-50 aria-disabled:cursor-wait transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * The milestone form, for a new one (no `milestone`) or in place of a row (#989): same fields,
 * checks and messages both ways. Escape cancels, except while the request runs (nor does
 * « Annuler »: the form would close under the answer).
 */
function MilestoneForm({ eventId, milestone, team, onSaved, onCancel }: {
  eventId: string
  milestone?: MilestoneRow
  team: TeamMember[]
  onSaved: (milestone: MilestoneRow) => void
  onCancel: () => void
}) {
  const id = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const ownerRef = useRef<HTMLSelectElement>(null)
  const [title, setTitle] = useState(milestone?.title ?? "")
  const [dueDate, setDueDate] = useState(milestone ? dueDateInputValue(milestone.dueDate) : "")
  const [ownerId, setOwnerId] = useState(milestone?.ownerId ?? "")
  // A deactivated current owner stays a choice (« compte désactivé »): saving keeps it unless changed.
  const options: OwnerOption[] = ownerOptions(team, milestone?.ownerId && milestone.ownerName ? { id: milestone.ownerId, name: milestone.ownerName } : null)
  const { submit, busy, error, fail, isInvalid } = useSubmit()
  const errorId = `${id}-error`

  useLayoutEffect(() => {
    const input = titleRef.current
    if (!input) return
    input.focus()
    // Caret at the end of a prefilled title: a stray key does not wipe it.
    input.setSelectionRange(input.value.length, input.value.length)
  }, [])

  function cancel() {
    if (busy) return
    onCancel()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const checked = validateMilestoneInput({ title, dueDate, ownerId })
    if (!checked.ok) {
      fail(checked.message, checked.field, checked.field === "title" ? titleRef.current : dateRef.current)
      return
    }
    if (milestone) {
      const changes = milestoneChanges(milestone, checked.value)
      if (Object.keys(changes).length === 0) { onSaved(milestone); return }
    }
    const outcome = await submit<MilestoneResponse>(() => fetch(
      milestone ? `/api/admin/events/${eventId}/milestones/${milestone.id}` : `/api/admin/events/${eventId}/milestones`,
      {
        method: milestone ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(milestone ? milestoneChanges(milestone, checked.value) : checked.value),
      },
    ), { silent: true })
    if (!outcome.ok) {
      if (!outcome.error) return // a second click while the first request runs
      // 422: the owner is no longer an active admin of the organisation (the only 422 of these routes).
      if (outcome.status === 422) { fail(outcome.error, "ownerId", ownerRef.current); return }
      fail(outcome.error, outcome.status === 400 ? "title" : undefined, outcome.status === 400 ? titleRef.current : null)
      return
    }
    onSaved(toRow(outcome.data))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Escape" || e.nativeEvent.isComposing || e.defaultPrevented) return
    e.preventDefault()
    e.stopPropagation()
    cancel()
  }

  const titleInvalid = isInvalid("title")
  const dateInvalid = isInvalid("dueDate")
  const ownerInvalid = isInvalid("ownerId")

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      noValidate
      aria-label={milestone ? `Modifier le jalon « ${milestone.title} »` : "Nouveau jalon"}
      className={milestone ? "space-y-3" : "bg-white border border-gray-200 rounded-xl p-4 space-y-3"}
    >
      <div>
        <label htmlFor={`${id}-title`} className="block text-sm font-medium text-gray-700 mb-1">
          Titre <span aria-hidden="true">*</span>
        </label>
        <input
          ref={titleRef}
          id={`${id}-title`}
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-invalid={titleInvalid}
          aria-describedby={titleInvalid ? errorId : undefined}
          maxLength={MILESTONE_TITLE_MAX}
          placeholder="ex. Fermer les inscriptions"
          className={`input w-full ${titleInvalid ? "!border-red-600" : ""}`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-date`} className="block text-sm font-medium text-gray-700 mb-1">
          Échéance <span aria-hidden="true">*</span>
        </label>
        <input
          ref={dateRef}
          id={`${id}-date`}
          type="date"
          required
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-invalid={dateInvalid}
          aria-describedby={dateInvalid ? errorId : undefined}
          className={`input w-full ${dateInvalid ? "!border-red-600" : ""}`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-owner`} className="block text-sm font-medium text-gray-700 mb-1">
          Responsable <span className="text-gray-500 font-normal">(facultatif)</span>
        </label>
        <select
          ref={ownerRef}
          id={`${id}-owner`}
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          aria-invalid={ownerInvalid}
          aria-describedby={ownerInvalid ? errorId : undefined}
          className={`input w-full ${ownerInvalid ? "!border-red-600" : ""}`}
        >
          <option value="">Aucun</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{ownerOptionLabel(o)}</option>
          ))}
        </select>
      </div>
      <FormStatus error={error} errorId={errorId} />
      <p role="status" className="sr-only">{busy ? "Enregistrement en cours…" : ""}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={cancel} aria-disabled={busy || undefined} className={quietButton}>
          Annuler
        </button>
        <button type="submit" aria-disabled={busy || undefined} className={primaryButton}>
          {busy ? (milestone ? "Enregistrement…" : "Ajout…") : milestone ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
    </form>
  )
}

export default function MilestonesSection({
  eventId, initialMilestones, team, timeZone,
}: {
  eventId: string
  initialMilestones: MilestoneRow[]
  /** Active admin accounts of the organisation, the possible owners (#985). */
  team: TeamMember[]
  /** The organisation's zone: a milestone is late once its due day is over there (#985). */
  timeZone: string
}) {
  const [milestones, setMilestones] = useState(initialMilestones)
  const [announcement, setAnnouncement] = useState("")
  // "new" for the creation form, a milestone id for its edit form, null when no form is open.
  const [editing, setEditing] = useState<string | null>(null)

  const checkboxIdPrefix = useId()
  // Deletion goes through a confirmation (#379); its failure stays in the dialog.
  const [pendingRemove, setPendingRemove] = useState<MilestoneRow | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // Outcome of a checkbox or removal: visible when it is an error, voiced in both cases.
  const [outcome, setOutcome] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)

  const addButtonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // Once React has committed the render that goes with it (form closed, list re-sorted).
  const [focusRequest, setFocusRequest] = useState<{ candidates: FocusCandidate[] } | null>(null)
  useLayoutEffect(() => {
    if (focusRequest) focusFirstAvailable(focusRequest.candidates)
  }, [focusRequest])

  // A getter: the row may have moved (re-sorted) or been remounted when focus comes back.
  const editButtonOf = (id: string) => () =>
    listRef.current?.querySelector<HTMLElement>(`[data-milestone-id="${CSS.escape(id)}"] [data-action="edit"]`) ?? null

  function closeForm(focusTo: FocusCandidate[]) {
    setEditing(null)
    setFocusRequest({ candidates: focusTo })
  }

  function added(milestone: MilestoneRow) {
    setMilestones((prev) => sortMilestones([...prev, milestone]))
    setOutcome(null)
    announce(setAnnouncement, `Jalon « ${milestone.title} » ajouté.`)
    closeForm([() => addButtonRef.current, editButtonOf(milestone.id)])
  }

  function edited(milestone: MilestoneRow) {
    setMilestones((prev) => replaceMilestone(prev, milestone))
    setOutcome(null)
    announce(setAnnouncement, `Jalon « ${milestone.title} » enregistré.`)
    closeForm([editButtonOf(milestone.id), () => addButtonRef.current])
  }

  async function toggleDone(milestone: MilestoneRow) {
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/milestones/${milestone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !milestone.done }),
    }), `Impossible de mettre à jour le jalon « ${milestone.title} ».`)
    if (!outcome.ok) {
      setOutcome({ kind: "error", text: outcome.error })
      return
    }
    setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? { ...m, done: !m.done } : m)))
    setOutcome(null)
    announce(setAnnouncement, `Jalon « ${milestone.title} » marqué ${!milestone.done ? "fait" : "à faire"}.`)
  }

  function handleRemove(milestone: MilestoneRow) {
    setRemoveError(null)
    setPendingRemove(milestone)
  }

  async function runRemove(milestone: MilestoneRow) {
    setRemoving(true)
    setRemoveError(null)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/milestones/${milestone.id}`, { method: "DELETE" }), `Impossible de supprimer le jalon « ${milestone.title} ».`)
    setRemoving(false)
    if (!outcome.ok) { setRemoveError(outcome.error); return }
    // The row's button that opened the dialog disappears with it: park the focus on the outcome.
    flushSync(() => {
      setPendingRemove(null)
      setMilestones((prev) => prev.filter((m) => m.id !== milestone.id))
      setOutcome({ kind: "ok", text: `Jalon « ${milestone.title} » supprimé.` })
    })
    outcomeRef.current?.focus()
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
      {pendingRemove && (
        <ConfirmActionModal recap={deleteMilestoneRecap(pendingRemove.title)} busy={removing} error={removeError} onConfirm={() => void runRemove(pendingRemove)} onCancel={() => setPendingRemove(null)} />
      )}
      <p
        ref={outcomeRef}
        tabIndex={-1}
        role={outcome?.kind === "error" ? "alert" : "status"}
        className={outcome ? `text-sm rounded-xl px-3 py-2 border focus:outline-none ${outcome.kind === "error" ? "text-red-800 bg-red-50 border-red-200" : "text-gray-800 bg-green-50 border-green-200"}` : "sr-only"}
      >
        {outcome?.text ?? ""}
      </p>

      {milestones.length === 0 && editing !== "new" && (
        <p className="text-sm text-gray-500">Aucun jalon pour l&apos;instant.</p>
      )}

      {milestones.length > 0 && (
        <ul ref={listRef} className="space-y-1.5" role="list">
          {milestones.map((m) => {
            if (editing === m.id) {
              return (
                <li key={m.id} data-milestone-id={m.id} className="bg-white border border-gray-200 rounded-lg px-3 py-3">
                  <MilestoneForm
                    eventId={eventId}
                    milestone={m}
                    team={team}
                    onSaved={edited}
                    onCancel={() => closeForm([editButtonOf(m.id), () => addButtonRef.current])}
                  />
                </li>
              )
            }
            const overdue = isMilestoneOverdue(m, new Date(), timeZone)
            const ownerInactive = m.ownerId !== null && !team.some((t) => t.id === m.ownerId)
            const checkboxId = `${checkboxIdPrefix}-done-${m.id}`
            return (
              // On a narrow screen the date and the actions wrap under the title instead of squeezing it.
              <li key={m.id} data-milestone-id={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={m.done}
                  onChange={() => toggleDone(m)}
                  aria-describedby={m.ownerName ? `${checkboxId}-owner` : undefined}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                {/* The owner under the title (#985): it wraps with it on a narrow screen. */}
                <div className="flex-1 min-w-[10rem]">
                  <label htmlFor={checkboxId} className={`block break-words text-sm cursor-pointer ${m.done ? "text-gray-500 line-through" : "text-gray-800"}`}>
                    {m.title}
                  </label>
                  {m.ownerName && (
                    <p id={`${checkboxId}-owner`} className="text-xs text-gray-600 break-words">
                      Responsable : {m.ownerName}{ownerInactive ? " (compte désactivé)" : ""}
                    </p>
                  )}
                </div>
                <span className="ml-auto flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                    {overdue && <span aria-hidden="true">⚠ </span>}
                    {fmtDate(m.dueDate)}
                    {overdue && <span className="sr-only"> (dépassé)</span>}
                  </span>
                  <span className="flex items-center gap-1">
                    {/* Named with the milestone (#587): every row has a « Modifier ». */}
                    <button
                      type="button"
                      data-action="edit"
                      onClick={() => setEditing(m.id)}
                      className="inline-flex items-center min-h-6 px-1.5 rounded text-xs text-gray-600 hover:text-blue-700 transition-colors"
                    >
                      Modifier<span className="sr-only"> le jalon « {m.title} »</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(m)}
                      aria-label={`Supprimer le jalon ${m.title}`}
                      className="inline-flex items-center justify-center min-h-6 min-w-6 rounded text-xs text-gray-500 hover:text-red-600 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {editing === "new" ? (
        <MilestoneForm eventId={eventId} team={team} onSaved={added} onCancel={() => closeForm([() => addButtonRef.current])} />
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          onClick={() => setEditing("new")}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          + Ajouter un jalon
        </button>
      )}
    </div>
  )
}
