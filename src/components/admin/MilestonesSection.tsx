"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useId, useRef, useEffect } from "react"
import { flushSync } from "react-dom"
import { announce } from "@/lib/announce"
import { deleteMilestoneRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import FormStatus from "@/components/FormStatus"
import { requestJson, useSubmit } from "@/lib/use-submit"

export type MilestoneRow = {
  id: string
  title: string
  dueDate: string
  done: boolean
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}

function isOverdue(m: MilestoneRow) {
  if (m.done) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(m.dueDate) < today
}

export default function MilestonesSection({
  eventId, initialMilestones,
}: {
  eventId: string
  initialMilestones: MilestoneRow[]
}) {
  const [milestones, setMilestones] = useState(initialMilestones)
  const [announcement, setAnnouncement] = useState("")
  const [showForm, setShowForm] = useState(false)

  const titleId = useId()
  const dateId = useId()
  const [title, setTitle] = useState("")
  const [dueDate, setDueDate] = useState("")
  const { submit, busy: saving, error, fail, isInvalid, reset } = useSubmit()
  const errorId = useId()
  // Deletion goes through a confirmation (#379); its failure stays in the dialog.
  const [pendingRemove, setPendingRemove] = useState<MilestoneRow | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  // Outcome of a checkbox or removal: visible when it is an error, voiced in both cases.
  const [outcome, setOutcome] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const outcomeRef = useRef<HTMLParagraphElement>(null)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

  // Same inline-reveal focus handling as SectorLeadersManager/PageFormModal: no ModalShell here
  // (a two-field inline form doesn't warrant a dialog), so focus is moved by hand.
  useEffect(() => {
    if (showForm) {
      titleInputRef.current?.focus()
      wasOpenRef.current = true
    } else if (wasOpenRef.current) {
      addButtonRef.current?.focus()
      wasOpenRef.current = false
    }
  }, [showForm])

  function closeForm() {
    setShowForm(false)
    reset()
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { fail("Indiquez le titre du jalon.", "title", titleInputRef.current); return }
    if (!dueDate) { fail("Indiquez l'échéance.", "dueDate", document.getElementById(dateId)); return }
    const outcome = await submit<MilestoneRow>(() => fetch(`/api/admin/events/${eventId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), dueDate }),
    }), { silent: true })
    if (!outcome.ok) {
      fail(outcome.error, outcome.status === 400 ? "title" : undefined, outcome.status === 400 ? titleInputRef.current : null)
      return
    }
    const milestone = outcome.data
    setMilestones((prev) => [...prev, milestone].sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
    announce(setAnnouncement, `Jalon « ${milestone.title} » ajouté.`)
    setTitle("")
    setDueDate("")
    closeForm()
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

      {milestones.length === 0 && !showForm && (
        <p className="text-sm text-gray-500">Aucun jalon pour l&apos;instant.</p>
      )}

      {milestones.length > 0 && (
        <ul className="space-y-1.5" role="list">
          {milestones.map((m) => {
            const overdue = isOverdue(m)
            const checkboxId = `${titleId}-done-${m.id}`
            return (
              <li key={m.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={m.done}
                  onChange={() => toggleDone(m)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <label htmlFor={checkboxId} className={`flex-1 min-w-0 text-sm cursor-pointer ${m.done ? "text-gray-500 line-through" : "text-gray-800"}`}>
                  {m.title}
                </label>
                <span className={`text-xs flex-shrink-0 whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-gray-500"}`}>
                  {overdue && <span aria-hidden="true">⚠ </span>}
                  {fmtDate(m.dueDate)}
                  {overdue && <span className="sr-only"> (dépassé)</span>}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(m)}
                  aria-label={`Supprimer le jalon ${m.title}`}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors flex-shrink-0"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {showForm ? (
        <form onSubmit={handleAdd} noValidate className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label htmlFor={titleId} className="block text-sm text-gray-700 mb-1">Titre *</label>
            <input
              ref={titleInputRef}
              id={titleId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={isInvalid("title")}
              aria-describedby={isInvalid("title") ? errorId : undefined}
              maxLength={140}
              placeholder="ex. Fermer les inscriptions"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor={dateId} className="block text-sm text-gray-700 mb-1">Échéance *</label>
            <input
              id={dateId}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-invalid={isInvalid("dueDate")}
              aria-describedby={isInvalid("dueDate") ? errorId : undefined}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <FormStatus error={error} errorId={errorId} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeForm} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              aria-disabled={saving || undefined}
              className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 aria-disabled:cursor-wait transition-colors"
            >
              {saving ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={addButtonRef}
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          + Ajouter un jalon
        </button>
      )}
    </div>
  )
}
