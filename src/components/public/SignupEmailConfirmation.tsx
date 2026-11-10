"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { dayLabel, spokenTimeRange } from "@/lib/spoken-time"
import type { SignupConfirmationPageState } from "@/lib/signup-confirmation"

export type SignupConfirmationDetails = {
  eventTitle: string
  eventSlug: string
  organizationName: string
  firstShifts: { label: string; roleName: string; date: string; startTime: string; endTime: string; waitlist: boolean; requiresApproval: boolean }[]
  deadline: string | null
  deadlineLabel: string | null
  counts: { active: number; requested: number; waiting: number } | null
}

type Counts = { active: number; requested: number; waiting: number }

const BUTTON = "block w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

function shiftName(s: SignupConfirmationDetails["firstShifts"][number]): string {
  return s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
}

function shiftState(s: SignupConfirmationDetails["firstShifts"][number]): string {
  if (s.waitlist) return "Liste d'attente à confirmer"
  if (s.requiresApproval) return "Demande à valider après confirmation"
  return "Place réservée"
}

/** The shifts listed by the email, with what confirming them will do. */
function ShiftList({ shifts }: { shifts: SignupConfirmationDetails["firstShifts"] }) {
  return (
    <ul role="list" className="divide-y divide-gray-100 bg-gray-50 border border-gray-200 rounded-xl text-sm">
      {shifts.map((s) => (
        <li key={`${s.label}-${s.date}-${s.startTime}`} className="px-4 py-3">
          <p className="font-medium text-gray-900">{shiftName(s)}</p>
          <p className="text-gray-700">{dayLabel(s.date)}</p>
          <p className="text-gray-700">{spokenTimeRange(s.startTime, s.endTime)}</p>
          <p className="text-xs text-gray-600">{shiftState(s)}</p>
        </li>
      ))}
    </ul>
  )
}

export default function SignupEmailConfirmation({ token, state: initial, details }: {
  token: string
  state: SignupConfirmationPageState
  details: SignupConfirmationDetails | null
}) {
  const [state, setState] = useState<SignupConfirmationPageState>(initial)
  const [counts, setCounts] = useState<Counts | null>(details?.counts ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const eventHref = details ? `/${encodeURIComponent(details.eventSlug)}` : "/"
  const eventLink = <a href={eventHref} className={LINK}>Revenir à l&apos;événement</a>

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch(`/api/public/confirmations/${encodeURIComponent(token)}/confirm`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body?.ok) {
        setState("confirmed")
        if (body.counts) setCounts(body.counts as Counts)
        return
      }
      if (res.status === 410) setState(body?.code === "replaced" ? "replaced" : "expired")
      else if (res.status === 404) setState("invalid")
      else if (res.status === 403) setState("unavailable")
      else setError(typeof body?.error === "string" ? body.error : "La confirmation n'a pas abouti. Réessaie dans un instant.")
    } catch {
      setError("La connexion a échoué : rien n'a été confirmé. Vérifie ta connexion et réessaie.")
    } finally {
      setBusy(false)
    }
  }

  if (state === "unavailable") {
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Espace indisponible</h1>
        <p className="text-sm text-gray-700">L&apos;espace de cette organisation n&apos;est pas disponible : ce lien ne permet plus de confirmer une inscription.</p>
      </>
    )
  }

  if (state === "confirmed") {
    const c = counts ?? { active: 0, requested: 0, waiting: 0 }
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Inscription confirmée</h1>
        <p className="text-sm text-gray-700 mb-4">Ton adresse est confirmée pour {details?.eventTitle ?? "cet événement"}.</p>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 mb-4">
          {c.active > 0 && <p>{c.active} place{c.active > 1 ? "s" : ""} confirmée{c.active > 1 ? "s" : ""}.</p>}
          {c.requested > 0 && <p>{c.requested} demande{c.requested > 1 ? "s" : ""} envoyée{c.requested > 1 ? "s" : ""} à l&apos;organisation.</p>}
          {c.waiting > 0 && <p>{c.waiting} créneau{c.waiting > 1 ? "x" : ""} en liste d&apos;attente.</p>}
          {c.active + c.requested + c.waiting === 0 && <p>Cette demande ne tient plus de place.</p>}
        </div>
        <p className="text-sm text-gray-700 mb-4">Tu recevras un email avec le lien de ta page « Mes inscriptions » pour gérer tes créneaux.</p>
        {eventLink}
      </>
    )
  }

  if (state === "expired") {
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Ce lien a expiré</h1>
        <p className="text-sm text-gray-700 mb-4">Tes places provisoires ont été remises à disposition. Tu peux refaire une demande depuis la page de l&apos;événement : les places encore libres seront de nouveau réservées le temps de confirmer.</p>
        {eventLink}
      </>
    )
  }

  if (state === "replaced") {
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Cette demande a été remplacée</h1>
        <p className="text-sm text-gray-700 mb-4">Une nouvelle demande pour la même adresse a pris sa place. Ouvre le dernier email reçu pour confirmer.</p>
        {eventLink}
      </>
    )
  }

  if (state === "cancelled" || state === "invalid") {
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{state === "cancelled" ? "Cette demande a été annulée" : "Ce lien n'est plus valable"}</h1>
        <p className="text-sm text-gray-700 mb-4">Refais une demande depuis la page de l&apos;événement si tu veux t&apos;inscrire.</p>
        {eventLink}
      </>
    )
  }

  return (
    <>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Confirme ton inscription</h1>
      <p className="text-sm text-gray-700 mb-4">
        {details?.organizationName} a reçu ta demande pour <strong>{details?.eventTitle}</strong>. Ouvre tes places en cliquant sur le bouton : ouvrir ce lien ne confirme rien.
      </p>
      {details && <ShiftList shifts={details.firstShifts} />}
      {details?.deadlineLabel && (
        <p className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 my-4">
          Tes places sont réservées jusqu&apos;au {details.deadlineLabel}. Passé ce délai, elles redeviendront disponibles.
        </p>
      )}
      {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 my-4">{error}</p>}
      <button type="button" onClick={() => void confirm()} aria-disabled={busy || undefined} className={BUTTON}>
        {busy ? "Confirmation…" : "Confirmer mon inscription"}
      </button>
    </>
  )
}
