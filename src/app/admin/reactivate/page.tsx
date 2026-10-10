"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useSubmit } from "@/lib/use-submit"
import { REACTIVATION_LINK_HOURS } from "@/lib/org-reactivation"
import FormStatus from "@/components/FormStatus"

const inputClass = "w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

/**
 * « Réactiver mon espace » (#811): an administrator of a space deactivated for lack of activity
 * asks for a single-use link. Same answer whether the address is known or not.
 */
export default function ReactivatePage() {
  const id = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLHeadingElement>(null)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const { submit, busy, error, fail, isInvalid } = useSubmit()

  // The form is replaced by the confirmation: the focus follows, onto its heading.
  useEffect(() => { if (submitted) doneRef.current?.focus() }, [submitted])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fail("Indiquez votre adresse email complète.", "email", emailRef.current)
      return
    }
    const outcome = await submit(() => fetch("/api/public/org-reactivation/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    }))
    if (outcome.ok || outcome.status !== null) setSubmitted(true)
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Réactiver mon espace</h1>
          <p className="text-gray-600 text-sm mt-1">
            Votre espace a été désactivé faute d&apos;activité ? Entrez l&apos;adresse de votre compte administrateur pour recevoir un lien qui le réactive.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-3">
            <h2 ref={doneRef} tabIndex={-1} className="font-semibold text-gray-900 focus:outline-none">Demande envoyée</h2>
            <p className="text-sm text-gray-600">
              Si cette adresse est celle d&apos;un administrateur d&apos;un espace désactivé faute d&apos;activité, vous recevrez un lien valable {REACTIVATION_LINK_HOURS} heures.
            </p>
            <p className="text-sm text-gray-600">
              Un espace désactivé par l&apos;équipe du service ne se réactive pas ainsi : écrivez-lui.
            </p>
            <Link href="/admin/login" className="block text-sm text-blue-700 underline underline-offset-2 mt-2">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label htmlFor={`${id}-email`} className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id={`${id}-email`}
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={isInvalid("email")}
                aria-describedby={error ? `${id}-error` : undefined}
                className={inputClass}
                autoComplete="email"
              />
            </div>
            <FormStatus error={error} errorId={`${id}-error`} />
            <button
              type="submit"
              aria-disabled={busy || undefined}
              className={`w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-medium hover:bg-gray-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800 ${busy ? "opacity-80 cursor-wait" : ""}`}
            >
              {busy ? "Envoi…" : "Recevoir le lien"}
            </button>
            <div className="text-center">
              <Link href="/admin/login" className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900">
                Retour à la connexion
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
