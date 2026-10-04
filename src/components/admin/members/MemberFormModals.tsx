"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import ModalShell from "@/components/admin/ModalShell"
import AvailabilityFields from "@/components/AvailabilityFields"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"
import { parseTags, type Member } from "@/lib/members-list"
import type { AvailabilityPeriod } from "@/lib/availability"
import type { FocusCandidate } from "@/lib/focus-return"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldKey = "firstName" | "lastName" | "email"

/** The checks a member form makes before sending; returns the first problem, with its field. */
function memberProblem(v: { firstName: string; lastName: string; email: string }): { field: FieldKey; message: string } | null {
  if (!v.firstName.trim()) return { field: "firstName", message: "Indiquez le prénom." }
  if (!v.lastName.trim()) return { field: "lastName", message: "Indiquez le nom." }
  if (v.email.trim() && !EMAIL.test(v.email.trim())) return { field: "email", message: "Indiquez une adresse email complète, ou laissez le champ vide." }
  return null
}

/** The API's 400/409 talk about the address (duplicate, invalid); mark it. */
const fieldForStatus = (status: number | null): FieldKey | undefined => (status === 400 || status === 409 ? "email" : undefined)

export function EditMemberModal({ member, onClose, onSaved, fallbackFocusOnClose }: { member: Member; onClose: () => void; onSaved: () => void; fallbackFocusOnClose?: FocusCandidate }) {
  const [firstName, setFirstName] = useState(member.firstName)
  const [lastName, setLastName] = useState(member.lastName)
  const [email, setEmail] = useState(member.email ?? "")
  const [phone, setPhone] = useState(member.phone ?? "")
  const [tags, setTags] = useState(member.tags.join(", "))
  const [notes, setNotes] = useState(member.notes ?? "")
  const [availability, setAvailability] = useState<{ periods: AvailabilityPeriod[]; note: string }>({
    periods: (member.availabilityPeriods ?? []) as AvailabilityPeriod[], note: member.availabilityNote ?? "",
  })
  const [active, setActive] = useState(member.active)
  const activeId = useId()
  const errorId = useId()
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  // Only called from handlers, never during render.
  const elementFor = (f: FieldKey) => (f === "firstName" ? firstNameRef : f === "lastName" ? lastNameRef : emailRef).current
  const { submit, busy, error, fail, isInvalid } = useSubmit()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const problem = memberProblem({ firstName, lastName, email })
    if (problem) { fail(problem.message, problem.field, elementFor(problem.field)); return }
    const outcome = await submit(() => fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        tags: parseTags(tags),
        notes: notes || undefined,
        active,
        availabilityPeriods: availability.periods,
        availabilityNote: availability.note.trim() || null,
      }),
    }), { silent: true, fallback: "Erreur lors de la mise à jour." })
    if (!outcome.ok) { const f = fieldForStatus(outcome.status); fail(outcome.error, f, f ? elementFor(f) : null); return }
    onSaved()
  }

  return (
    <ModalShell title="Modifier le membre" busy={busy} onClose={() => { if (!busy) onClose() }} fallbackFocusOnClose={fallbackFocusOnClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <p className="text-xs text-gray-600">* champ obligatoire</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} inputRef={firstNameRef} invalid={isInvalid("firstName")} errorId={errorId} autoComplete="off" />
          <Field label="Nom" required value={lastName} onChange={setLastName} inputRef={lastNameRef} invalid={isInvalid("lastName")} errorId={errorId} autoComplete="off" />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} inputRef={emailRef} invalid={isInvalid("email")} errorId={errorId} autoComplete="off" />
        <Field label="Téléphone" type="tel" value={phone} onChange={setPhone} autoComplete="off" />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="bénévole, bar" />
        <Field label="Notes" value={notes} onChange={setNotes} multiline />
        <AvailabilityFields periods={availability.periods} note={availability.note} onChange={setAvailability} />
        <div className="flex items-center gap-2">
          <input id={activeId} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          <label htmlFor={activeId} className="text-sm text-gray-700">Membre actif</label>
        </div>
        <FormStatus error={error} errorId={errorId} />
        <Actions busy={busy} onClose={onClose} label="Enregistrer" />
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
  const [availability, setAvailability] = useState<{ periods: AvailabilityPeriod[]; note: string }>({ periods: [], note: "" })
  const errorId = useId()
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  // Only called from handlers, never during render.
  const elementFor = (f: FieldKey) => (f === "firstName" ? firstNameRef : f === "lastName" ? lastNameRef : emailRef).current
  const { submit, busy, error, fail, isInvalid } = useSubmit()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const problem = memberProblem({ firstName, lastName, email })
    if (problem) { fail(problem.message, problem.field, elementFor(problem.field)); return }
    const outcome = await submit(() => fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        tags: parseTags(tags),
        availabilityPeriods: availability.periods,
        availabilityNote: availability.note.trim() || null,
      }),
    }), { silent: true, fallback: "Erreur lors de la création." })
    if (!outcome.ok) { const f = fieldForStatus(outcome.status); fail(outcome.error, f, f ? elementFor(f) : null); return }
    onCreated()
    onClose()
  }

  return (
    <ModalShell title="Nouveau membre" busy={busy} onClose={() => { if (!busy) onClose() }}>
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <p className="text-xs text-gray-600">* champ obligatoire</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Prénom" required value={firstName} onChange={setFirstName} inputRef={firstNameRef} invalid={isInvalid("firstName")} errorId={errorId} autoComplete="off" />
          <Field label="Nom" required value={lastName} onChange={setLastName} inputRef={lastNameRef} invalid={isInvalid("lastName")} errorId={errorId} autoComplete="off" />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} inputRef={emailRef} invalid={isInvalid("email")} errorId={errorId} autoComplete="off" />
        <Field label="Téléphone" type="tel" value={phone} onChange={setPhone} autoComplete="off" />
        <Field label="Tags (séparés par des virgules)" value={tags} onChange={setTags} placeholder="parent CM2, bar" />
        <AvailabilityFields periods={availability.periods} note={availability.note} onChange={setAvailability} />
        <FormStatus error={error} errorId={errorId} />
        <Actions busy={busy} onClose={onClose} label="Créer" />
      </form>
    </ModalShell>
  )
}

function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={() => { if (!busy) onClose() }} aria-disabled={busy || undefined} className="text-sm px-4 py-2 text-gray-700 hover:text-gray-900 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Annuler
      </button>
      <button
        type="submit"
        aria-disabled={busy || undefined}
        className={`bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-80 cursor-wait" : ""}`}
      >
        {busy ? "Enregistrement…" : label}
      </button>
    </div>
  )
}

function Field({
  label, value, onChange, type = "text", required = false, placeholder, multiline = false, inputRef, invalid, errorId, autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  multiline?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
  invalid?: true
  errorId?: string
  autoComplete?: string
}) {
  const id = useId()
  const cls = "w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gray-700 mb-1">
        {label}{required && <><span aria-hidden="true"> *</span><span className="sr-only"> (obligatoire)</span></>}
      </label>
      {multiline ? (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls} />
      ) : (
        <input
          id={id}
          ref={inputRef}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          aria-describedby={invalid && errorId ? errorId : undefined}
          className={cls}
        />
      )}
    </div>
  )
}
