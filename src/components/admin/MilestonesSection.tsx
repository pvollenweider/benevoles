"use client"

import { useState, useId, useRef, useEffect } from "react"

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }
    const milestone = await res.json()
    setMilestones((prev) => [...prev, milestone].sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
    setAnnouncement(`Jalon « ${milestone.title} » ajouté.`)
    setTitle("")
    setDueDate("")
    closeForm()
  }

  async function toggleDone(milestone: MilestoneRow) {
    const res = await fetch(`/api/admin/events/${eventId}/milestones/${milestone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !milestone.done }),
    })
    if (!res.ok) {
      setAnnouncement(`Échec : impossible de mettre à jour le jalon « ${milestone.title} ».`)
      return
    }
    setMilestones((prev) => prev.map((m) => (m.id === milestone.id ? { ...m, done: !m.done } : m)))
    setAnnouncement(`Jalon « ${milestone.title} » marqué ${!milestone.done ? "fait" : "à faire"}.`)
  }

  async function handleRemove(milestone: MilestoneRow) {
    if (!confirm(`Supprimer le jalon « ${milestone.title} » ?`)) return
    const res = await fetch(`/api/admin/events/${eventId}/milestones/${milestone.id}`, { method: "DELETE" })
    if (res.ok) {
      setMilestones((prev) => prev.filter((m) => m.id !== milestone.id))
      setAnnouncement(`Jalon « ${milestone.title} » supprimé.`)
    } else {
      setAnnouncement(`Échec : impossible de supprimer le jalon « ${milestone.title} ».`)
    }
  }

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

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
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <label htmlFor={titleId} className="block text-sm text-gray-700 mb-1">Titre *</label>
            <input
              ref={titleInputRef}
              id={titleId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
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
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeForm} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "…" : "Ajouter"}
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={addButtonRef}
          onClick={() => setShowForm(true)}
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          + Ajouter un jalon
        </button>
      )}
    </div>
  )
}
