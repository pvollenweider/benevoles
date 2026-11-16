// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
"use client"

import { useEffect, useId, useRef, useState } from "react"
import FormStatus from "@/components/FormStatus"
import RequiredMark from "@/components/RequiredMark"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { useSubmit, requestJson } from "@/lib/use-submit"
import type { ActionRecap } from "@/lib/action-recap"
import type { FrontDeskAccessStatus, FrontDeskAccessView } from "@/lib/front-desk-access"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const fieldClass = `w-full min-h-11 border border-gray-500 rounded-xl px-3 py-2 text-sm ${focusRing}`
const buttonClass = `inline-flex items-center justify-center min-h-11 px-4 rounded-xl text-sm font-medium ${focusRing}`

const STATUS: Record<FrontDeskAccessStatus, { label: string; className: string; sign?: string }> = {
  active: { label: "Actif", className: "bg-green-100 text-green-700", sign: "✓ " },
  invitation_sent: { label: "Invitation envoyée", className: "bg-amber-100 text-amber-900" },
  revoked: { label: "Révoqué", className: "bg-gray-100 text-gray-700" },
  expired: { label: "Expiré", className: "bg-gray-100 text-gray-600" },
}

function StatusWord({ status }: { status: FrontDeskAccessStatus }) {
  const s = STATUS[status]
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.sign && <span aria-hidden="true">{s.sign}</span>}
      {s.label}
    </span>
  )
}

const isLive = (status: FrontDeskAccessStatus): boolean => status === "active" || status === "invitation_sent"

type Props = {
  eventId: string
  initialAccesses: FrontDeskAccessView[]
}

/**
 * « Accès accueil » (#1142), at the bottom of an event's day-of page for its owners: who may mark
 * attendance on this event, with their status in words, and the actions to invite, send the
 * invitation again or revoke. A disclosure whose open state is controlled, so a board refresh
 * never closes it. The invitation link exists only in the email: nothing here shows it.
 */
export default function FrontDeskAccessPanel({ eventId, initialAccesses }: Props) {
  const id = useId()
  const [accesses, setAccesses] = useState<FrontDeskAccessView[]>(initialAccesses)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  // A guard per row, not one global flag: resending Léa's invitation must not silently ignore a
  // click on Noé's row.
  const resendingRef = useRef(new Set<string>())
  const [resendingIds, setResendingIds] = useState<ReadonlySet<string>>(new Set())
  const [revoking, setRevoking] = useState<FrontDeskAccessView | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const focusAfterRevoke = useRef<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const inviteRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const lastRevokedRef = useRef<string | null>(null)
  const { submit, busy, error, status, setStatus, reset, fail, isInvalid, quiet, alertShown } = useSubmit()

  // After a revocation the row stays (with « Révoqué ») but its buttons unmount: focus the row's
  // name, which took tabIndex={-1} for that purpose. A ref, not state: the effect only moves focus.
  useEffect(() => {
    const id = focusAfterRevoke.current
    if (!id) return
    focusAfterRevoke.current = null
    rowRefs.current.get(id)?.focus()
  }, [accesses])

  const liveCount = accesses.filter((a) => isLive(a.status)).length

  async function reload(): Promise<FrontDeskAccessView[] | null> {
    const outcome = await requestJson<{ accesses: FrontDeskAccessView[] }>(() => fetch(`/api/admin/events/${encodeURIComponent(eventId)}/front-desk-access`, { headers: { Accept: "application/json" } }))
    if (!outcome.ok || !Array.isArray(outcome.data.accesses)) return null
    setAccesses(outcome.data.accesses)
    return outcome.data.accesses
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim().length < 2) {
      // A new client-side failure must not leave the previous success sentence on screen.
      setStatus("")
      fail("Indiquez le nom de la personne (2 caractères au moins).", "name", nameRef.current)
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("")
      fail("Indiquez une adresse email complète.", "email", emailRef.current)
      return
    }
    const invited = email.trim()
    const outcome = await submit<{ accepted: true }>(() => fetch(`/api/admin/events/${encodeURIComponent(eventId)}/front-desk-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: invited }),
    }), { silent: true })
    if (!outcome.ok) {
      // A refused address (an owner or an organiser of this organisation, a deactivated front-desk
      // account) concerns the field. An address the route may not touch gets the same 202 as a
      // sent invitation, so it is not an error here.
      const onEmail = outcome.status === 400 || outcome.status === 409
      fail(outcome.error, onEmail ? "email" : undefined, onEmail ? emailRef.current : null)
      return
    }
    setName("")
    setEmail("")
    const rows = await reload()
    if (!rows) {
      // The invitation request succeeded but the list could not be read: say nothing about what
      // the list shows, and never claim an email was sent.
      setStatus("L'invitation est prise en compte. La liste n'a pas pu être relue : rechargez la page.")
      inviteRef.current?.focus()
      return
    }
    // An activated front-desk account of this organisation already has its password: the grant
    // was added or re-opened without any email. The reloaded row says which case happened.
    const existingAccount = rows.find((row) => row.email.toLowerCase() === invited.toLowerCase() && row.status === "active")
    setStatus(existingAccount
      ? `Accès ajouté pour ${existingAccount.name}, qui a déjà un compte accueil.`
      : "Si cette adresse peut recevoir un accès accueil, l'invitation est partie. L'accès apparaît dans la liste ci-dessous.")
    inviteRef.current?.focus()
  }

  async function handleResend(access: FrontDeskAccessView) {
    if (resendingRef.current.has(access.id)) return
    resendingRef.current.add(access.id)
    setResendingIds(new Set(resendingRef.current))
    const outcome = await requestJson(() => fetch(`/api/admin/events/${encodeURIComponent(eventId)}/front-desk-access/${encodeURIComponent(access.id)}/resend`, { method: "POST" }))
    resendingRef.current.delete(access.id)
    setResendingIds(new Set(resendingRef.current))
    if (!outcome.ok) {
      setStatus("")
      fail(outcome.error)
      return
    }
    // A success clears an earlier error and its `aria-invalid`, not only the status line.
    reset()
    setStatus(`Invitation renvoyée à ${access.name}. Le lien précédent ne fonctionne plus.`)
  }

  async function handleRevoke() {
    if (!revoking || revokeBusy) return
    setRevokeBusy(true)
    setRevokeError(null)
    const target = revoking
    const outcome = await requestJson(() => fetch(`/api/admin/events/${encodeURIComponent(eventId)}/front-desk-access/${encodeURIComponent(target.id)}`, { method: "DELETE" }))
    setRevokeBusy(false)
    if (!outcome.ok) {
      setRevokeError(outcome.error)
      return
    }
    lastRevokedRef.current = target.id
    setAccesses((rows) => rows.map((row) => (row.id === target.id ? { ...row, status: "revoked" } : row)))
    setRevoking(null)
    reset()
    setStatus(`${target.name} : accès révoqué.`)
    focusAfterRevoke.current = target.id
  }

  const revokeRecap: ActionRecap = {
    title: revoking ? `Révoquer l'accès de ${revoking.name} ?` : "Révoquer cet accès ?",
    lines: revoking
      ? [
          `${revoking.name} ne pourra plus ouvrir le pointage de cet événement, même avec une page déjà ouverte.`,
          "Son compte est conservé ; s'il n'a plus aucun autre accès en cours, sa session est fermée.",
          "Vous pourrez lui redonner un accès en l'invitant de nouveau.",
        ]
      : [],
    confirmLabel: "Révoquer",
    danger: true,
  }

  return (
    <section aria-labelledby={`${id}-title`} className="border-t border-gray-200 pt-4">
      <h2 id={`${id}-title`} ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">
        Accès accueil ({liveCount})
      </h2>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="mt-2">
        <summary className={`min-h-11 py-3 cursor-pointer rounded-xl text-sm font-medium text-blue-700 underline underline-offset-2 ${focusRing}`}>
          Gérer les accès accueil de cet événement
        </summary>
        <div className="mt-3 space-y-5">
          <p className="text-sm text-gray-700">
            Ces personnes peuvent seulement marquer les présences sur cette page, le jour de l&apos;événement. Elles voient le nom et le téléphone des bénévoles attendus, rien d&apos;autre de votre espace.
          </p>

          <FormStatus status={status} error={error} errorId={`${id}-error`} quiet={quiet} alertShown={alertShown} />

          <form onSubmit={handleInvite} noValidate aria-labelledby={`${id}-form-title`} className="space-y-3">
            <h3 id={`${id}-form-title`} className="text-sm font-semibold text-gray-900">Inviter une personne</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${id}-name`} className="block text-sm font-medium text-gray-700 mb-1">Prénom et nom<RequiredMark /></label>
                <input
                  id={`${id}-name`}
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="off"
                  aria-invalid={isInvalid("name")}
                  aria-describedby={isInvalid("name") ? `${id}-error` : undefined}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor={`${id}-email`} className="block text-sm font-medium text-gray-700 mb-1">Email<RequiredMark /></label>
                <input
                  id={`${id}-email`}
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                  aria-invalid={isInvalid("email")}
                  aria-describedby={isInvalid("email") ? `${id}-error` : undefined}
                  className={fieldClass}
                />
              </div>
            </div>
            <button
              ref={inviteRef}
              type="submit"
              aria-disabled={busy || undefined}
              className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700 aria-disabled:opacity-50 aria-disabled:cursor-wait`}
            >
              {busy ? "Envoi…" : "Inviter"}
            </button>
          </form>

          {accesses.length === 0 ? (
            <p className="text-sm text-gray-700">Personne n&apos;a encore d&apos;accès accueil pour cet événement.</p>
          ) : (
            <ul role="list" className="divide-y divide-gray-100 border-t border-gray-100">
              {accesses.map((access) => (
                <li key={access.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p
                        ref={(el) => { if (el) rowRefs.current.set(access.id, el); else rowRefs.current.delete(access.id) }}
                        tabIndex={-1}
                        className="font-medium text-gray-900 break-words focus:outline-none"
                      >
                        {access.name}
                      </p>
                      <p className="text-sm text-gray-700 break-words">{access.email}</p>
                    </div>
                    <div className="flex flex-col items-start sm:items-end gap-1">
                      <StatusWord status={access.status} />
                      <p className="text-xs text-gray-600">
                        {access.status === "revoked"
                          ? "Accès révoqué"
                          : access.status === "expired"
                            ? `Accès terminé le ${access.endsOnLabel}`
                            : `Jusqu'au ${access.endsOnLabel} inclus`}
                      </p>
                    </div>
                  </div>
                  {(access.status === "active" || access.status === "invitation_sent") && (
                    <div className="flex flex-wrap gap-2">
                      {access.status === "invitation_sent" && (
                        <button
                          type="button"
                          onClick={() => handleResend(access)}
                          aria-disabled={resendingIds.has(access.id) || undefined}
                          aria-label={`Renvoyer l'invitation, ${access.name}`}
                          className={`${buttonClass} border border-blue-600 text-blue-700 bg-white hover:bg-blue-50 aria-disabled:opacity-50 aria-disabled:cursor-wait`}
                        >
                          Renvoyer l&apos;invitation
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setRevokeError(null); lastRevokedRef.current = null; setRevoking(access) }}
                        aria-label={`Révoquer, ${access.name}`}
                        className={`${buttonClass} border border-gray-300 text-gray-800 bg-white hover:bg-gray-50`}
                      >
                        Révoquer
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {revoking && (
        <ConfirmActionModal
          recap={revokeRecap}
          busy={revokeBusy}
          error={revokeError}
          onConfirm={handleRevoke}
          onCancel={() => { if (!revokeBusy) setRevoking(null) }}
          fallbackFocusOnClose={() => (lastRevokedRef.current ? rowRefs.current.get(lastRevokedRef.current) : headingRef.current)}
        />
      )}
    </section>
  )
}
