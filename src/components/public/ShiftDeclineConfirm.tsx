"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState } from "react"
import { shiftDeclineApiPath, type ShiftDeclineSecret } from "@/lib/shift-declines"

type State = "open" | "cancelled" | "full" | "past" | "registered" | "declined" | "deleted" | "invalid"

type Props = {
  secret: ShiftDeclineSecret
  token: string
  shiftId: string
  state: State
  eventTitle?: string
  /** The shift's name, day and hours, for the answerable page. */
  shiftName?: string
  shiftDay?: string
  shiftHours?: string
  /** The member's answer date, on an already answered shift. */
  declinedOn?: string
}

const HEADINGS: Record<Exclude<State, "open">, string> = {
  invalid: "Lien introuvable",
  deleted: "Créneau introuvable",
  cancelled: "Créneau annulé",
  full: "Créneau complet",
  past: "Créneau passé",
  registered: "Tu as déjà ce créneau",
  declined: "C'est déjà noté",
}

/**
 * « Je ne peux pas » for one precise shift (#1303): the confirmation page the open-shifts email
 * links to. The page only reads; the single button sends the POST. One heading, one button at
 * most, the result announced in place (role="status", focused), usable at 320 px and with the
 * keyboard only. No reason, no free text, no undo: taking the shift later removes the answer.
 */
export default function ShiftDeclineConfirm({ secret, token, shiftId, state, eventTitle, shiftName, shiftDay, shiftHours, declinedOn }: Props) {
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => { if (done) resultRef.current?.focus() }, [done])

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(shiftDeclineApiPath(secret, token, shiftId), { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : "La confirmation n'a pas pu être envoyée. Réessaie.")
        return
      }
      if (body?.success === false) {
        // The shift changed between the page and the button: say why, never an error page.
        setError(typeof body?.message === "string" ? body.message : "Ce créneau n'est plus disponible.")
        return
      }
      setDone(true)
    } catch {
      setError("La confirmation n'a pas pu être envoyée. Réessaie.")
    } finally {
      setBusy(false)
    }
  }

  if (state === "open" && !done) {
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 break-words">{shiftName}</h1>
        {eventTitle && <p className="mt-1 text-sm text-gray-700 break-words">{eventTitle}</p>}
        <p className="mt-3 text-sm text-gray-800">
          {shiftDay}, {shiftHours}
        </p>
        <p className="mt-4 text-sm text-gray-700">
          Tu ne peux pas venir sur ce créneau ? Confirme-le : l&apos;organisation le verra pour ce créneau seulement, et ne te le proposera plus par erreur.
        </p>
        <button
          type="button"
          onClick={confirm}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className="mt-6 w-full min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-base font-semibold text-white hover:bg-blue-700 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {busy ? "Envoi en cours…" : "Confirmer que je ne peux pas"}
        </button>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      </>
    )
  }

  if (state === "open" && done) {
    return (
      <>
        <h1 className="text-xl font-bold text-gray-900 break-words">{shiftName}</h1>
        <p ref={resultRef} tabIndex={-1} role="status" className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-800 focus:outline-none">
          C&apos;est noté. Tu as indiqué ne pas pouvoir prendre ce créneau ; l&apos;organisation le verra pour ce créneau seulement. Si tu changes d&apos;avis, tu peux t&apos;inscrire depuis ton lien : prendre le créneau retirera ta réponse.
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="text-xl font-bold text-gray-900 break-words">{HEADINGS[state as Exclude<State, "open">]}</h1>
      <p className="mt-3 text-sm text-gray-700">
        {state === "invalid" && "Ce lien n'est plus valable. Vérifie l'adresse du lien reçu par email, ou demande-le à nouveau à l'organisation."}
        {state === "deleted" && "Ce créneau n'existe plus. L'organisation a peut-être modifié son planning."}
        {state === "cancelled" && "Ce créneau a été annulé. Tu n'as rien à confirmer."}
        {state === "full" && "Ce créneau est déjà complet. Tu n'as rien à confirmer."}
        {state === "past" && "Ce créneau est passé. Tu n'as rien à confirmer."}
        {state === "registered" && "Tu as déjà une inscription sur ce créneau. Rien à répondre : il est déjà à toi."}
        {state === "declined" && `Tu as indiqué le ${declinedOn} ne pas pouvoir prendre ce créneau. L'organisation le voit pour ce créneau seulement.`}
      </p>
    </>
  )
}
