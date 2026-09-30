"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { useSubmit } from "@/lib/use-submit"
import FormStatus from "@/components/FormStatus"

type Admin = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  pending: boolean
}

export default function AdminsManager({
  initialAdmins,
  currentEmail,
}: {
  initialAdmins: Admin[]
  currentEmail: string
}) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", email: "" })
  const id = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const { submit, busy: submitting, error, status, setStatus, fail, reset, isInvalid } = useSubmit()
  // Where the focus lands when a control disappears (form closed, admin removed).
  const inviteButtonRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (form.name.trim().length < 2) { fail("Indiquez le nom de la personne (2 caractères au moins).", "name", nameRef.current); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { fail("Indiquez une adresse email complète.", "email", emailRef.current); return }
    const outcome = await submit<Admin & { inviteUrl: string }>(() => fetch("/api/admin/settings/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim() }),
    }), { silent: true })
    if (!outcome.ok) {
      // A refused address (already an admin, invalid) concerns the field; the rest, the form.
      fail(outcome.error, outcome.status === 400 || outcome.status === 409 ? "email" : undefined, outcome.status === 400 || outcome.status === 409 ? emailRef.current : null)
      return
    }
    setAdmins((prev) => [...prev, outcome.data])
    setInviteUrl(outcome.data.inviteUrl)
    setForm({ name: "", email: "" })
    setShowForm(false)
    setStatus(`Invitation envoyée à ${outcome.data.email}.`)
    inviteButtonRef.current?.focus()
  }

  async function handleRemove(adminId: string) {
    if (removing) return
    setRemoving(adminId)
    const outcome = await submit(() => fetch(`/api/admin/settings/admins/${adminId}`, { method: "DELETE" }))
    setRemoving(null)
    if (!outcome.ok) return
    setAdmins((prev) => prev.filter((a) => a.id !== adminId))
    setStatus("Administrateur retiré.")
    headingRef.current?.focus()
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setStatus("Lien d'invitation copié.")
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      <FormStatus status={status} error={error} errorId={`${id}-error`} />

      {inviteUrl && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-medium text-blue-900">Lien d&apos;invitation créé</h2>
          <p className="text-xs text-blue-700 break-all font-mono">{inviteUrl}</p>
          <button
            onClick={() => copyUrl(inviteUrl)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {copied ? "Copié !" : "Copier le lien"}
          </button>
          <p className="text-xs text-blue-800">Un email a été envoyé. Ce lien expire dans 7 jours.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-gray-700 focus:outline-none">
            Administrateurs ({admins.length})
          </h2>
          <button
            ref={inviteButtonRef}
            onClick={() => { setShowForm(true); setInviteUrl(null); reset() }}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span aria-hidden="true">+ </span>Inviter
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleInvite} noValidate aria-labelledby={`${id}-invite-title`} className="px-4 py-4 border-b border-gray-100 bg-gray-50 space-y-3">
            <h3 id={`${id}-invite-title`} className="text-sm font-medium text-gray-800">Inviter un administrateur</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-name`} className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
                <input
                  id={`${id}-name`}
                  ref={nameRef}
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  aria-invalid={isInvalid("name")}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor={`${id}-email`} className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input
                  id={`${id}-email`}
                  ref={emailRef}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  aria-invalid={isInvalid("email")}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                aria-disabled={submitting || undefined}
                className={`text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${submitting ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {submitting ? "Envoi…" : "Envoyer l'invitation"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); inviteButtonRef.current?.focus() }}
                className="text-sm text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-gray-100">
          {admins.map((admin) => {
            const isSelf = admin.email === currentEmail
            return (
              <div key={admin.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">{admin.name}</p>
                    {admin.pending && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        En attente
                      </span>
                    )}
                    {isSelf && (
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        Vous
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 truncate">{admin.email}</p>
                </div>
                {!isSelf && (
                  <button
                    onClick={() => handleRemove(admin.id)}
                    aria-disabled={removing === admin.id || undefined}
                    aria-label={`Retirer ${admin.name}`}
                    className={`text-xs text-gray-600 hover:text-red-700 transition-colors flex-shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${removing === admin.id ? "opacity-70 cursor-wait" : ""}`}
                  >
                    {removing === admin.id ? "Retrait…" : "Retirer"}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
