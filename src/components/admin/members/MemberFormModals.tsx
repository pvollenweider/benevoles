"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import ModalShell from "../ModalShell"
import { parseTags, type Member } from "@/lib/members-list"

export function EditMemberModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [firstName, setFirstName] = useState(member.firstName)
  const [lastName, setLastName] = useState(member.lastName)
  const [email, setEmail] = useState(member.email ?? "")
  const [phone, setPhone] = useState(member.phone ?? "")
  const [tags, setTags] = useState(member.tags.join(", "))
  const [notes, setNotes] = useState(member.notes ?? "")
  const [active, setActive] = useState(member.active)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const activeId = useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
        tags: parseTags(tags),
        notes: notes || undefined,
        active,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la mise à jour")
      return
    }
    onSaved()
  }

  return (
    <ModalShell title="Modifier le membre" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">* champ obligatoire</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} />
          <Field label="Nom" required value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Téléphone" value={phone} onChange={setPhone} />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="bénévole, bar" />
        <Field label="Notes" value={notes} onChange={setNotes} multiline />
        <div className="flex items-center gap-2">
          <input
            id={activeId}
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <label htmlFor={activeId} className="text-sm text-gray-700">Membre actif</label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

export function AddMemberModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [tags, setTags] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
        tags: parseTags(tags),
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la création")
      return
    }
    onCreated()
    onClose()
  }

  return (
    <ModalShell title="Nouveau membre" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500">* champ obligatoire</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} />
          <Field label="Nom" required value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Téléphone" value={phone} onChange={setPhone} />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="parent CM2, bar" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "…" : "Créer"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  multiline?: boolean
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-700 mb-1">
        {label}{required && " *"}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        />
      )}
    </div>
  )
}
