"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState, useTransition, type ComponentProps } from "react"
import { flushSync } from "react-dom"
import { RESENT_LINK_NOTICE } from "@/lib/invite-link"
import { announce } from "@/lib/announce"
import { requestJson } from "@/lib/use-submit"
import { approveOrgRecap, deleteOrgRecap, liftSuspensionRecap, refuseOrgRecap, suspendOrgRecap, toggleOrgRecap } from "@/lib/action-recap"
import { ORG_STATUS_LABELS, orgStatus, SUSPENSION_REASON_MAX, SUSPENSION_REASON_MIN } from "@/lib/org-suspension"
import { formatCount, type UsageRow } from "@/lib/usage-counters"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import InactivityPanel from "@/components/super-admin/InactivityPanel"
import { useRouter } from "next/navigation"
import Link from "next/link"

type Admin = {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

type OrgCount = {
  events: number
  admins: number
  volunteers: number
}

type Org = {
  id: string
  name: string
  slug: string
  active: boolean
  suspendedAt: string | null
  suspensionReason: string | null
  signupDescription: string | null
  publicationApprovedAt: string | null
  outboundEmailApprovedAt: string | null
  createdAt: string
  updatedAt: string
  _count: OrgCount
  admins: Admin[]
}

export default function OrgDetail({ org, cumulative, inactivity }: { org: Org; cumulative: UsageRow[]; inactivity?: ComponentProps<typeof InactivityPanel> }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<"toggle" | "delete" | "suspend" | "lift" | "approve" | "refuse" | null>(null)
  // Suspension for abuse (#810): its own action, with the operator's reason.
  const [suspensionReason, setSuspensionReason] = useState("")
  // The reason's own error, tied to the field (never the modal's error, which can't describe it).
  const [reasonError, setReasonError] = useState<string | null>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const status = orgStatus(org)
  // After a change of state, the button that opened the dialog is gone (« Suspendre pour abus »
  // becomes « Lever la suspension », and back): focus goes to the page heading instead of <body>.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const previousStatus = useRef(status)
  useEffect(() => {
    if (previousStatus.current === status) return
    previousStatus.current = status
    headingRef.current?.focus()
  }, [status])
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("")
  // Resending the invite of a pending admin: the new link is shown (the old one is dead, #269).
  const [resend, setResend] = useState<{ busyFor: string | null; link: string | null; email: string | null; error: string | null }>({ busyFor: null, link: null, email: null, error: null })

  async function resendInvite(adminId: string) {
    if (resend.busyFor) return
    setResend({ busyFor: adminId, link: null, email: null, error: null })
    const result = await requestJson<{ sent: boolean; emailError: string | null; inviteUrl: string; email: string }>(() => fetch(`/api/super-admin/organizations/${org.id}/send-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId }),
    }), "L'invitation n'a pas pu être renvoyée.")
    if (!result.ok) {
      setResend({ busyFor: null, link: null, email: null, error: result.error })
      return
    }
    const { sent, emailError, inviteUrl, email } = result.data
    // Even when the email failed, the token is rotated: the new link is the only valid one.
    setResend({ busyFor: null, link: inviteUrl, email, error: sent ? null : `${emailError ?? "L'email n'a pas pu être envoyé."} Transmettez le nouveau lien affiché sous le tableau.` })
    if (sent) announce(setOutcome, `Invitation renvoyée à ${email}. Un nouveau lien d'activation est affiché sous le tableau ; l'ancien ne fonctionne plus.`)
  }
  const [name, setName] = useState(org.name)
  const [slug, setSlug] = useState(org.slug)
  const [savingName, setSavingName] = useState(false)
  const [savingSlug, setSavingSlug] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)
  const [slugSaved, setSlugSaved] = useState(false)

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function patch(data: Record<string, unknown>) {
    return fetch(`/api/super-admin/organizations/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  }

  function toggleActive() {
    setToggleError(null)
    setConfirming("toggle")
  }

  async function runToggle() {
    setToggling(true)
    setToggleError(null)
    const result = await requestJson(() => patch({ active: !org.active }), "La modification n'a pas été enregistrée.")
    setToggling(false)
    if (!result.ok) { setToggleError(result.error); return }
    setConfirming(null)
    announce(setOutcome, org.active ? "Organisation désactivée." : "Organisation réactivée.")
    refresh()
  }

  function openSuspension(kind: "suspend" | "lift") {
    setToggleError(null)
    setReasonError(null)
    setSuspensionReason("")
    setConfirming(kind)
  }

  async function runSuspension(kind: "suspend" | "lift") {
    if (kind === "suspend" && suspensionReason.trim().length < SUSPENSION_REASON_MIN) {
      // Cleared then set, so the alert speaks again on a second failed try; focus to the field.
      flushSync(() => setReasonError(null))
      flushSync(() => setReasonError(`Indiquez la raison de la suspension, entre ${SUSPENSION_REASON_MIN} et ${SUSPENSION_REASON_MAX} caractères.`))
      reasonRef.current?.focus()
      return
    }
    setReasonError(null)
    setToggling(true)
    setToggleError(null)
    const body = kind === "suspend" ? { suspended: true, suspensionReason: suspensionReason.trim() } : { suspended: false }
    const result = await requestJson(() => patch(body), "La modification n'a pas été enregistrée.")
    setToggling(false)
    if (!result.ok) { setToggleError(result.error); return }
    setConfirming(null)
    announce(setOutcome, kind === "suspend" ? "Organisation suspendue." : "Suspension levée : l'organisation reste désactivée.")
    refresh()
  }

  // Review of a space awaiting validation (#810): on this page, never from a link.
  function openReview(kind: "approve" | "refuse") {
    setToggleError(null)
    setConfirming(kind)
  }

  async function runReview(kind: "approve" | "refuse") {
    setToggling(true)
    setToggleError(null)
    const result = await requestJson(() => fetch(`/api/super-admin/organizations/${org.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: kind }),
    }), "La décision n'a pas été enregistrée.")
    setToggling(false)
    if (!result.ok) { setToggleError(result.error); return }
    setConfirming(null)
    if (kind === "refuse") {
      router.push("/super-admin/organizations")
      return
    }
    announce(setOutcome, "Espace validé : ses administrateurs sont prévenus par email.")
    refresh()
  }

  function deleteOrg() {
    setDeleteError(null)
    setConfirming("delete")
  }

  // The dialog only lets this run once the slug has been typed; the server checks it again.
  async function runDelete() {
    setDeleting(true)
    setDeleteError(null)
    const result = await requestJson(() => fetch(`/api/super-admin/organizations/${org.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSlug: org.slug }),
    }), "Erreur lors de la suppression.")
    setDeleting(false)
    if (!result.ok) { setDeleteError(result.error); return }
    router.push("/super-admin/organizations")
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed === org.name) return
    setSavingName(true)
    setNameError(null)
    setNameSaved(false)
    const res = await patch({ name: trimmed })
    setSavingName(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setNameError(typeof d.error === "string" ? d.error : "Erreur.")
      return
    }
    setNameSaved(true)
    refresh()
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = slug.trim().toLowerCase()
    if (trimmed === org.slug) return
    setSavingSlug(true)
    setSlugError(null)
    setSlugSaved(false)
    const res = await patch({ slug: trimmed })
    setSavingSlug(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setSlugError(typeof d.error === "string" ? d.error : "Erreur.")
      return
    }
    const d = await res.json()
    setSlugSaved(true)
    router.push(`/super-admin/organizations/${d.slug}`)
  }

  const createdAt = new Date(org.createdAt).toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/super-admin/organizations" className="text-sm text-gray-500 hover:text-gray-700">
              Organisations
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-sm text-gray-600">{org.name}</span>
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 mt-1 focus:outline-none">{org.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-xs text-gray-500">{org.slug}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status === "active" ? "bg-green-100 text-green-800" : status === "pending" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{ORG_STATUS_LABELS[status]}</span>
          </div>
          {status === "suspended" && org.suspensionReason && (
            <p className="text-sm text-gray-800 mt-1 break-words">Raison de la suspension : {org.suspensionReason}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">Créée le {createdAt}</p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/super-admin/use-org/${org.id}`}
            aria-label={`Gérer l'organisation ${org.name}`}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700"
          >
            Gérer →
          </a>
          {status === "pending" && (
            <>
              <button
                type="button"
                onClick={() => openReview("approve")}
                className="text-sm px-4 py-2 rounded-xl font-medium bg-green-700 text-white hover:bg-green-800"
              >
                Valider l&apos;espace
              </button>
              <button
                type="button"
                onClick={() => openReview("refuse")}
                className="text-sm px-4 py-2 rounded-xl font-medium border border-red-300 text-red-700 hover:bg-red-50"
              >
                Refuser et supprimer
              </button>
            </>
          )}
          {status === "suspended" ? (
            <button
              type="button"
              onClick={() => openSuspension("lift")}
              className="text-sm px-4 py-2 rounded-xl font-medium border border-gray-300 text-gray-800 hover:bg-gray-50"
            >
              Lever la suspension
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleActive}
                className={`text-sm px-4 py-2 rounded-xl font-medium ${
                  org.active ? "bg-red-700 text-white hover:bg-red-800" : "bg-green-700 text-white hover:bg-green-800"
                }`}
              >
                {org.active ? "Désactiver" : "Réactiver"}
              </button>
              <button
                type="button"
                onClick={() => openSuspension("suspend")}
                className="text-sm px-4 py-2 rounded-xl font-medium border border-red-300 text-red-700 hover:bg-red-50"
              >
                Suspendre pour abus
              </button>
            </>
          )}
          {!org.active && (
            <button
              type="button"
              onClick={deleteOrg}
              className="text-sm px-4 py-2 rounded-xl font-medium border border-red-300 text-red-700 hover:bg-red-50"
            >
              Supprimer définitivement
            </button>
          )}
        </div>
      </div>
      <p role="status" className={outcome ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2" : "sr-only"}>{outcome}</p>
      {confirming === "toggle" && (
        <ConfirmActionModal recap={toggleOrgRecap(org.name, org.active)} busy={toggling} error={toggleError} onConfirm={() => void runToggle()} onCancel={() => setConfirming(null)} />
      )}
      {confirming === "approve" && (
        <ConfirmActionModal recap={approveOrgRecap(org.name)} busy={toggling} error={toggleError} onConfirm={() => void runReview("approve")} onCancel={() => setConfirming(null)} />
      )}
      {confirming === "refuse" && (
        <ConfirmActionModal
          recap={refuseOrgRecap(org.name)}
          challenge={{ label: `Pour confirmer, tapez l'identifiant « ${org.slug} »`, expected: org.slug }}
          busy={toggling}
          error={toggleError}
          onConfirm={() => void runReview("refuse")}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === "suspend" && (
        <ConfirmActionModal recap={suspendOrgRecap(org.name)} busy={toggling} error={toggleError} onConfirm={() => void runSuspension("suspend")} onCancel={() => setConfirming(null)}>
          <label htmlFor="suspension-reason" className="block text-sm font-medium text-gray-900">Raison de la suspension</label>
          <p id="suspension-reason-hint" className="text-xs text-gray-600">Entre {SUSPENSION_REASON_MIN} et {SUSPENSION_REASON_MAX} caractères. Visible du super admin seulement. Pas de donnée personnelle inutile.</p>
          <textarea
            ref={reasonRef}
            id="suspension-reason"
            aria-describedby={reasonError ? "suspension-reason-hint suspension-reason-error" : "suspension-reason-hint"}
            aria-invalid={reasonError ? true : undefined}
            required
            minLength={SUSPENSION_REASON_MIN}
            maxLength={SUSPENSION_REASON_MAX}
            rows={3}
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
          <p id="suspension-reason-error" role="alert" className="text-sm text-red-800 mt-1">{reasonError}</p>
        </ConfirmActionModal>
      )}
      {confirming === "lift" && (
        <ConfirmActionModal recap={liftSuspensionRecap(org.name)} busy={toggling} error={toggleError} onConfirm={() => void runSuspension("lift")} onCancel={() => setConfirming(null)} />
      )}
      {confirming === "delete" && (
        <ConfirmActionModal
          recap={deleteOrgRecap({ name: org.name, events: org._count.events, volunteers: org._count.volunteers, admins: org._count.admins })}
          challenge={{ label: `Pour confirmer, tapez l'identifiant « ${org.slug} »`, expected: org.slug }}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void runDelete()}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* What the association wrote when signing up (#810): typed text, shown as plain text only. */}
      {org.signupDescription && (
        <section aria-labelledby="org-signup-description" className="bg-white border border-gray-200 rounded-xl p-4">
          <h2 id="org-signup-description" className="text-sm font-semibold text-gray-900">Demande d&apos;inscription</h2>
          <p className="text-xs text-gray-600 mt-0.5">Ce que l&apos;association a écrit sur elle et son besoin en créant son espace.</p>
          <p className="text-sm text-gray-800 mt-2 whitespace-pre-line break-words">{org.signupDescription}</p>
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Événements" value={org._count.events} />
        <StatCard label="Administrateurs" value={org._count.admins} />
        <StatCard label="Membres" value={org._count.volunteers} />
      </div>

      {/* Cumulative counters (#805): what this organisation ever created, never lowered by a deletion. */}
      <section aria-labelledby="org-cumulative" className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 id="org-cumulative" className="text-sm font-semibold text-gray-900">Depuis le début</h2>
        <p className="text-xs text-gray-600 mt-0.5">Tout ce que cette organisation a créé, y compris ce qui a été supprimé depuis. Ce qui avait été supprimé avant la mise en place de ces compteurs n&apos;y figure pas.</p>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          {cumulative.map((r) => (
            <div key={r.key}>
              <dt className="text-xs text-gray-600">{r.label}</dt>
              <dd className="text-lg font-semibold text-gray-900 tabular-nums">{formatCount(r.value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Periodic check of inactive organisations (#811): postpone or exclude. */}
      {inactivity && <InactivityPanel {...inactivity} />}

      {/* Edit name + slug */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <form onSubmit={saveName} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <label htmlFor="sa-org-name" className="text-xs font-semibold text-gray-600">Nom</label>
          <div className="flex gap-2">
            <input
              id="sa-org-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameSaved(false) }}
              minLength={2}
              maxLength={100}
              required
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={savingName || name.trim() === org.name || name.trim().length < 2}
              className="bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
            >
              {savingName ? "…" : "OK"}
            </button>
          </div>
          {nameSaved && <p role="status" className="text-xs text-green-600">Enregistré.</p>}
          {nameError && <p role="alert" className="text-xs text-red-600">{nameError}</p>}
        </form>

        <form onSubmit={saveSlug} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <label htmlFor="sa-org-slug" className="text-xs font-semibold text-gray-600">Slug</label>
          <div className="flex gap-2">
            <input
              id="sa-org-slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugSaved(false) }}
              minLength={2}
              maxLength={40}
              pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
              required
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={savingSlug || slug.trim().toLowerCase() === org.slug || slug.trim().length < 2}
              className="bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40"
            >
              {savingSlug ? "…" : "OK"}
            </button>
          </div>
          {slugSaved && <p role="status" className="text-xs text-green-600">Enregistré. L&apos;ancien slug redirige vers le nouveau.</p>}
          {slugError && <p role="alert" className="text-xs text-red-600">{slugError}</p>}
        </form>
      </div>

      {/* Admins */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Administrateurs</h2>
        {org.admins.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun administrateur.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Nom</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Email</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Rôle</th>
                  <th scope="col" className="text-left px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {org.admins.map((admin) => (
                  <tr key={admin.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{admin.name}</td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3 text-gray-500">{admin.role}</td>
                    <td className="px-4 py-3">
                      {admin.isActive ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Actif</span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">En attente d&apos;activation</span>
                          <button
                            type="button"
                            onClick={() => void resendInvite(admin.id)}
                            aria-disabled={resend.busyFor ? true : undefined}
                            className="inline-flex items-center min-h-6 px-1 -mx-1 text-xs text-blue-700 underline underline-offset-2 rounded aria-disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          >
                            Renvoyer l&apos;invitation<span className="sr-only"> à {admin.email}</span>
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span role="status" className="sr-only">{resend.busyFor ? "Envoi en cours…" : ""}</span>
            <p role="alert" className={resend.error ? "m-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}>{resend.error ?? ""}</p>
            {resend.link && (
              <div className="m-4 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                <p id="resend-link-title" className="text-sm font-semibold text-blue-900">Nouveau lien d&apos;activation{resend.email ? ` pour ${resend.email}` : ""}</p>
                <p className="text-xs text-blue-900">{RESENT_LINK_NOTICE} Valable 7 jours.</p>
                <input
                  readOnly
                  aria-labelledby="resend-link-title"
                  value={resend.link}
                  className="w-full font-mono text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-900 select-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
