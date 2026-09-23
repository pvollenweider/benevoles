"use client"

import { useState, useId, useRef, useEffect } from "react"
import { slugify } from "@/lib/utils"

export type SectorLeaderRow = {
  id: string
  roleName: string
  name: string
  email: string
}

export type RegisteredVolunteer = {
  id: string
  name: string
  email: string
  roleNames: string[]
}

export default function SectorLeadersManager({
  eventId, initialLeaders, roleNames, registeredVolunteers = [],
}: {
  eventId: string
  initialLeaders: SectorLeaderRow[]
  roleNames: string[]
  registeredVolunteers?: RegisteredVolunteer[]
}) {
  const [leaders, setLeaders] = useState(initialLeaders)
  const [announcement, setAnnouncement] = useState("")
  const [showForm, setShowForm] = useState(false)

  const roleId = useId()
  const nameId = useId()
  const emailId = useId()
  const pickId = useId()
  const [roleName, setRoleName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleInputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)

  // Not a modal (ModalShell doesn't fit an inline form), so focus is managed by hand: move it
  // into the form when it appears, and back to the trigger button when it closes — same intent
  // as ModalShell's own focus trap/return, adapted to an inline reveal. The trigger button
  // unmounts while the form is open, so it can only be refocused after the close re-render
  // brings it back — hence the effect (a direct .focus() right after setShowForm(false) would
  // still see the old, about-to-unmount DOM).
  useEffect(() => {
    if (showForm) {
      roleInputRef.current?.focus()
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

  function pickRegisteredVolunteer(volunteerId: string) {
    const volunteer = registeredVolunteers.find((v) => v.id === volunteerId)
    if (!volunteer) return
    setName(volunteer.name)
    setEmail(volunteer.email)
    // Several roles for the same person: default to the first, still adjustable in the field
    // above (it's a free-text input with a datalist, not locked to this list).
    setRoleName(volunteer.roleNames[0] ?? "")
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/sector-leaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName, name, email }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }
    const leader = await res.json()
    setLeaders((prev) => [...prev, leader])
    setAnnouncement(`${leader.name} ajouté·e comme responsable de « ${leader.roleName} », invitation envoyée par email.`)
    setRoleName("")
    setName("")
    setEmail("")
    closeForm()
  }

  async function handleRemove(leader: SectorLeaderRow) {
    if (!confirm(`Retirer ${leader.name} comme responsable de « ${leader.roleName} » ?`)) return
    const res = await fetch(`/api/admin/events/${eventId}/sector-leaders/${leader.id}`, { method: "DELETE" })
    if (res.ok) {
      setLeaders((prev) => prev.filter((l) => l.id !== leader.id))
      setAnnouncement(`${leader.name} retiré·e des responsables de « ${leader.roleName} ».`)
    }
  }

  const grouped = leaders.reduce<Record<string, SectorLeaderRow[]>>((acc, l) => {
    (acc[l.roleName] ??= []).push(l)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {leaders.length === 0 ? "Aucun responsable pour l'instant." : `${leaders.length} responsable${leaders.length > 1 ? "s" : ""}`}
        </p>
        {!showForm && (
          <button
            ref={addButtonRef}
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Ajouter un·e responsable
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {registeredVolunteers.length > 0 && (
            <div>
              <label htmlFor={pickId} className="block text-sm text-gray-700 mb-1">Depuis les inscrits (optionnel)</label>
              <select
                id={pickId}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) pickRegisteredVolunteer(e.target.value)
                  e.target.value = ""
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                <option value="">Sélectionner un·e bénévole déjà inscrit·e…</option>
                {registeredVolunteers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} · {v.roleNames.join(", ")}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Remplit le nom, l&apos;email et le poste ci-dessous — modifiable avant l&apos;ajout.</p>
            </div>
          )}
          <div>
            <label htmlFor={roleId} className="block text-sm text-gray-700 mb-1">Poste *</label>
            <input
              ref={roleInputRef}
              id={roleId}
              type="text"
              list={`${roleId}-options`}
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              required
              maxLength={100}
              placeholder="ex. Bar"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
            <datalist id={`${roleId}-options`}>
              {roleNames.map((r) => <option key={r} value={r} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor={nameId} className="block text-sm text-gray-700 mb-1">Nom *</label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor={emailId} className="block text-sm text-gray-700 mb-1">Email *</label>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={closeForm} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-50 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Envoi…" : "Ajouter et envoyer le lien"}
            </button>
          </div>
        </form>
      )}

      {Object.keys(grouped).length > 0 && (
        <div className="space-y-3">
          {Object.entries(grouped).map(([role, roleLeaders]) => {
            // Role names are free text (spaces, accents) — HTML ids can't contain whitespace,
            // so slugify() rather than the raw role name.
            const headingId = `role-${slugify(role) || "poste"}`
            return (
            <section key={role} className="bg-white border border-gray-200 rounded-xl p-4" aria-labelledby={headingId}>
              <h2 id={headingId} className="text-sm font-medium text-gray-900 mb-2">{role}</h2>
              <ul className="space-y-2" role="list">
                {roleLeaders.map((leader) => (
                  <li key={leader.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{leader.name}</p>
                      <p className="text-xs text-gray-500 truncate">{leader.email}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(leader)}
                      aria-label={`Retirer ${leader.name} des responsables de ${role}`}
                      className="text-xs text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
