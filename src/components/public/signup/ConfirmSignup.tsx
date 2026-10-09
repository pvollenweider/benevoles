"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import Link from "next/link"
import { useSubmit } from "@/lib/use-submit"
import FormStatus from "@/components/FormStatus"

type State = "ok" | "unknown" | "expired" | "used"

const STATE_TEXT: Record<Exclude<State, "ok">, { title: string; text: string }> = {
  unknown: { title: "Lien non valable", text: "Ce lien de confirmation n'est pas valable. Refaites une demande depuis la page d'inscription." },
  expired: { title: "Lien expiré", text: "Ce lien de confirmation a expiré : il était valable 24 heures. Refaites une demande depuis la page d'inscription." },
  used: { title: "Demande déjà confirmée", text: "Cette demande est déjà confirmée. Si vous n'avez pas encore choisi votre mot de passe, utilisez le lien reçu après la confirmation, ou « Mot de passe oublié » une fois votre compte activé." },
}

/**
 * The confirmation page's content (#810, part 4b): opening the email's link changes nothing; the
 * « Confirmer » button creates the space, then the person chooses a password on the existing
 * account activation page (the answer's link).
 */
export default function ConfirmSignup({ link, state, organizationName }: { link: string; state: State; organizationName: string | null }) {
  const id = useId()
  const { submit, busy, error } = useSubmit()
  // Busy until the browser has left: the link is already used, a second click would fail.
  const [navigating, setNavigating] = useState(false)
  const working = busy || navigating

  if (state !== "ok") {
    const { title, text } = STATE_TEXT[state]
    return (
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
        <p className="text-base text-gray-700 dark:text-gray-300">{text}</p>
        <p><Link href="/inscription" className="text-base text-blue-700 underline underline-offset-2 dark:text-blue-300">Page d&apos;inscription</Link></p>
      </div>
    )
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (working) return
    const outcome = await submit<{ inviteUrl: string }>(() => fetch("/api/public/signup/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: link }),
    }))
    if (outcome.ok) {
      setNavigating(true)
      window.location.assign(outcome.data.inviteUrl)
    }
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Confirmer votre adresse</h1>
      <p className="text-base text-gray-700 dark:text-gray-300 break-words">
        Confirmez pour créer l&apos;espace{organizationName ? <> de <strong className="text-gray-900 dark:text-gray-100">{organizationName}</strong></> : null}. Vous choisirez ensuite votre mot de passe.
      </p>
      <FormStatus error={error} errorId={`${id}-error`} />
      <button type="submit" aria-disabled={working || undefined} aria-describedby={error ? `${id}-error` : undefined}
        className={`rounded-xl bg-gray-900 px-5 py-3 text-base font-medium text-white hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white ${working ? "cursor-wait opacity-80" : ""}`}>
        {working ? "Création…" : "Confirmer et créer mon espace"}
      </button>
    </form>
  )
}
