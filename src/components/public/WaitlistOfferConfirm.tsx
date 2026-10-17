"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { WAITLIST_OFFER_PAGE_TITLES, type WaitlistOfferPageState, type WaitlistOfferView as View } from "@/lib/waitlist-offer"

export type WaitlistOfferDetails = {
  eventTitle: string
  shiftLabel: string
  /** « Samedi 4 juillet » */
  day: string
  /** « de 10h à 12h » */
  time: string
  /** « Confirme avant … », or null without a deadline. */
  deadline: string | null
  /** « Sur validation » shift (#484): accepting sends a request. */
  requiresApproval: boolean
}

const TITLES: Record<View, string> = {
  offered: "Une place s'est libérée",
  expired: "Lien expiré",
  active: "Place déjà confirmée",
  requested: "Demande déjà envoyée",
  invalid: "Lien expiré ou invalide",
  confirmed: "Place confirmée !",
  requestSent: "Demande envoyée",
  gone: "Place plus disponible",
}

const TEXTS: Partial<Record<View, string>> = {
  expired: "Le délai pour prendre cette place est passé : elle est proposée à la personne suivante.",
  active: "Cette place est déjà à toi : il n'y a rien d'autre à faire.",
  requested: "L'organisation va répondre à ta demande par email. La place t'est réservée d'ici là.",
  invalid: "Ce lien n'est plus valable : l'offre a expiré, a été refusée ou n'existe pas.",
  confirmed: "Ton inscription est maintenant active. Tu vas recevoir un email de confirmation. À très vite\u00a0!",
  requestSent: "Ce créneau est sur validation : la place t'est réservée le temps que l'organisation réponde. Tu recevras un email avec sa réponse.",
}

const NETWORK_ERROR = "La confirmation n'a pas pu être envoyée. Vérifie ta connexion et réessaie."

const LINK_CLASS = "inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline underline-offset-2 rounded hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * The page the offer email's link opens (#1044). Reading it changes nothing: mail scanners and link
 * previews open links, some run the page's scripts. The « Prendre la place » button accepts the
 * offer (POST), like the sign-up confirmation page (#810).
 */
export default function WaitlistOfferConfirm({ token, state, details }: { token: string; state: WaitlistOfferPageState; details: WaitlistOfferDetails | null }) {
  const id = useId()
  const [view, setView] = useState<View>(state)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [goneMessage, setGoneMessage] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const initialView = useRef<View>(state)

  // The view swapped under the visitor (the button is gone): focus and announce the new heading,
  // and keep the tab title in step. Not on the first render, where the heading is the page itself.
  useLayoutEffect(() => {
    if (view === initialView.current) return
    document.title = WAITLIST_OFFER_PAGE_TITLES[view]
    headingRef.current?.focus()
  }, [view])

  async function accept(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/waitlist/${encodeURIComponent(token)}/confirm`, { method: "POST" })
      const data = await res.json().catch(() => ({})) as { success?: boolean; requested?: boolean; error?: string }
      if (res.ok && data.success) {
        setView(data.requested ? "requestSent" : "confirmed")
      } else if (res.status === 404 || res.status === 410) {
        // The offer is gone (expired, already taken): the button could only fail again.
        setGoneMessage(data.error ?? TEXTS.invalid!)
        setView("gone")
      } else {
        setError(data.error ?? NETWORK_ERROR)
      }
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  const heading = (
    <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-gray-900 mb-2 outline-none">
      {TITLES[view]}
    </h1>
  )
  const myLink = view === "invalid"
    ? <Link href="/" className={LINK_CLASS}>Retour à l&apos;accueil</Link>
    : <Link href={`/my/${token}`} className={LINK_CLASS}>Accéder à mon inscription</Link>

  if (view === "offered" && details) {
    return (
      <form onSubmit={accept} className="text-left">
        {heading}
        <p className="text-sm text-gray-700 mb-4">
          Pour <strong className="text-gray-900">{details.eventTitle}</strong> : elle est à toi si tu la prends.
        </p>
        <dl className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mb-4">
          <dt className="text-gray-700">Créneau</dt>
          <dd className="font-medium text-gray-900 break-words">{details.shiftLabel}</dd>
          <dt className="text-gray-700">Date</dt>
          <dd className="font-medium text-gray-900">{details.day}</dd>
          <dt className="text-gray-700">Horaire</dt>
          <dd className="font-medium text-gray-900">{details.time}</dd>
        </dl>
        {details.deadline && <p className="text-sm text-amber-900 mb-3">{details.deadline}</p>}
        {details.requiresApproval && (
          <p className="text-sm text-gray-700 mb-3">Ce créneau est sur validation : en prenant la place, tu envoies une demande à l&apos;organisation, qui te répondra par email.</p>
        )}
        <p id={`${id}-error`} role="alert" className={`text-sm font-medium text-red-700 ${error ? "mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}`}>{error ?? ""}</p>
        <button
          type="submit"
          aria-disabled={busy || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full min-h-11 bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-90 aria-disabled:cursor-wait transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          {busy ? "Confirmation…" : "Prendre la place"}
        </button>
        <p className="text-sm text-gray-700 mt-4">
          Tu ne peux plus venir ? Tu peux refuser la place depuis ta page personnelle.
        </p>
        <p>{myLink}</p>
      </form>
    )
  }

  const text = view === "gone" ? goneMessage : TEXTS[view]
  return (
    <div className="text-center">
      {view === "confirmed" && <span aria-hidden="true" className="text-5xl block mb-4">🎉</span>}
      {heading}
      {text && <p className="text-sm text-gray-700 mb-4">{text}</p>}
      <p>{myLink}</p>
    </div>
  )
}
