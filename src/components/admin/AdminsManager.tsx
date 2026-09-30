"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSubmit } from "@/lib/use-submit"
import FormStatus from "@/components/FormStatus"
import { ORGANIZER_ROLE, OWNER_ROLE, ROLE_LABEL, type OrgRole } from "@/lib/permissions"

const ROLE_HELP: Record<OrgRole, string> = {
  admin: "Tous les droits, dont l'équipe d'administration et les réglages de l'organisation.",
  organizer: "Événements, créneaux, inscriptions, membres et messages ; pas l'équipe ni les réglages de l'organisation.",
}
const roleLabel = (role: string) => ROLE_LABEL[role as OrgRole] ?? role

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
  canManage,
}: {
  initialAdmins: Admin[]
  currentEmail: string
  /** Owners manage the team (#469); organisers see it only. */
  canManage: boolean
}) {
  const [admins, setAdmins] = useState<Admin[]>(initialAdmins)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<{ name: string; email: string; role: OrgRole }>({ name: "", email: "", role: ORGANIZER_ROLE })
  const [changingRole, setChangingRole] = useState<string | null>(null)
  // A role is chosen in the select, then applied with a button: arrowing through a select must
  // not change anyone's rights (#469).
  const [draft, setDraft] = useState<Record<string, OrgRole>>({})
  const [roleErrorFor, setRoleErrorFor] = useState<string | null>(null)
  const router = useRouter()
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
      body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), role: form.role }),
    }), { silent: true })
    if (!outcome.ok) {
      // A refused address (already an admin, invalid) concerns the field; the rest, the form.
      fail(outcome.error, outcome.status === 400 || outcome.status === 409 ? "email" : undefined, outcome.status === 400 || outcome.status === 409 ? emailRef.current : null)
      return
    }
    setAdmins((prev) => [...prev, outcome.data])
    setInviteUrl(outcome.data.inviteUrl)
    setForm({ name: "", email: "", role: ORGANIZER_ROLE })
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

  const selectOf = (adminId: string) => document.getElementById(`${id}-role-of-${adminId}`)

  async function handleRole(admin: Admin, role: OrgRole) {
    if (submitting || changingRole || role === admin.role) return
    const demotingSelf = admin.email === currentEmail && role !== OWNER_ROLE
    setChangingRole(admin.id)
    setRoleErrorFor(null)
    const outcome = await submit(() => fetch(`/api/admin/settings/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }))
    setChangingRole(null)
    setDraft((d) => { const { [admin.id]: _drop, ...rest } = d; void _drop; return rest })
    if (!outcome.ok) {
      setRoleErrorFor(admin.id)
      selectOf(admin.id)?.focus()
      return
    }
    setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, role } : a)))
    if (demotingSelf) {
      // The team controls go away: land on the heading, then let the server render the page for the new role.
      setStatus("Votre rôle : organisateur. Vous ne gérez plus l'équipe ni les réglages de l'organisation.")
      headingRef.current?.focus()
      router.refresh()
      return
    }
    setStatus(`${admin.name} : ${roleLabel(role).toLowerCase()}.`)
    selectOf(admin.id)?.focus()
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
          {canManage && <button
            ref={inviteButtonRef}
            onClick={() => { setShowForm(true); setInviteUrl(null); reset() }}
            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <span aria-hidden="true">+ </span>Inviter
          </button>}
        </div>
        {!canManage && (
          <p className="px-4 py-2 border-b border-gray-100 text-xs text-gray-700">
            Votre rôle : organisateur. Seuls les propriétaires invitent, retirent ou changent le rôle des administrateurs.
          </p>
        )}

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
            <fieldset>
              <legend className="block text-xs font-medium text-gray-700 mb-1">Rôle</legend>
              <div className="space-y-1.5">
                {([ORGANIZER_ROLE, OWNER_ROLE] as const).map((r) => (
                  <div key={r} className="flex items-start gap-2">
                    <input id={`${id}-role-${r}`} type="radio" name={`${id}-role`} checked={form.role === r} onChange={() => setForm((f) => ({ ...f, role: r }))} aria-describedby={`${id}-role-${r}-help`} className="mt-0.5 h-4 w-4" />
                    <div>
                      <label htmlFor={`${id}-role-${r}`} className="text-sm text-gray-800">{ROLE_LABEL[r]}</label>
                      <p id={`${id}-role-${r}-help`} className="text-xs text-gray-600">{ROLE_HELP[r]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
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
                  {!canManage && <p className="text-xs text-gray-700">Rôle : {roleLabel(admin.role)}</p>}
                </div>
                {canManage && (() => {
                  const current = draft[admin.id] ?? (admin.role as OrgRole)
                  const pendingChange = current !== admin.role
                  const selfWarning = pendingChange && isSelf && current !== OWNER_ROLE
                  return (
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`${id}-role-of-${admin.id}`} className="sr-only">Rôle de {admin.name}</label>
                        <select
                          id={`${id}-role-of-${admin.id}`}
                          value={current}
                          onChange={(e) => { setRoleErrorFor(null); setDraft((d) => ({ ...d, [admin.id]: e.target.value as OrgRole })) }}
                          aria-invalid={roleErrorFor === admin.id && error ? true : undefined}
                          aria-describedby={roleErrorFor === admin.id && error ? `${id}-error` : undefined}
                          className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          <option value={OWNER_ROLE}>{ROLE_LABEL.admin}</option>
                          <option value={ORGANIZER_ROLE}>{ROLE_LABEL.organizer}</option>
                        </select>
                        {pendingChange && (
                          <button
                            type="button"
                            onClick={() => handleRole(admin, current)}
                            aria-disabled={changingRole === admin.id || undefined}
                            aria-describedby={selfWarning ? `${id}-self-${admin.id}` : undefined}
                            className={`text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${changingRole === admin.id ? "opacity-60 cursor-wait" : ""}`}
                          >
                            {changingRole === admin.id ? "Enregistrement…" : "Appliquer"}{" "}<span className="sr-only">le rôle de {admin.name}</span>
                          </button>
                        )}
                      </div>
                      {selfWarning && (
                        <p id={`${id}-self-${admin.id}`} className="text-xs text-amber-900 max-w-xs text-right">
                          Vous ne serez plus propriétaire : seul un autre propriétaire pourra vous rendre ce rôle.
                        </p>
                      )}
                    </div>
                  )
                })()}
                {canManage && !isSelf && (
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
