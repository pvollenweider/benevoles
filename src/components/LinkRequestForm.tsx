"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { INVALID_LINK_STEPS } from "@/lib/personal-link"

/**
 * When a personal link doesn't work (#376): why it can happen, and a form to get a new one by
 * email. The answer is always the same, whether the address is known or not.
 */
export default function LinkRequestForm() {
  const id = useId()
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  // Errors show once the field was left or the form submitted, never while typing the first characters.
  const [touched, setTouched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const showError = touched && !valid
  const errorText = email.trim().length === 0 ? "Indique l'adresse email utilisée pour t'inscrire." : "Indique une adresse email complète."

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!valid) { setTouched(true); inputRef.current?.focus(); return }
    setBusy(true)
    setMessage(null)
    setFailed(false)
    try {
      // The organization comes from the host; in development, from ?org= on this page.
      const org = new URLSearchParams(window.location.search).get("org")
      const res = await fetch(`/api/public/registrations/link${org ? `?org=${encodeURIComponent(org)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      setFailed(!res.ok)
      setMessage(data.message ?? data.error ?? (res.ok ? "Demande enregistrée." : "La demande n'a pas abouti. Réessaie plus tard."))
    } catch {
      setFailed(true)
      setMessage("Connexion impossible. Vérifie ton réseau et réessaie.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="text-left space-y-4">
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
        {INVALID_LINK_STEPS.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <form onSubmit={submit} noValidate className="space-y-2">
        <label htmlFor={`${id}-email`} className="block text-sm font-medium text-gray-700">Adresse email utilisée pour t&apos;inscrire <span aria-hidden="true">*</span><span className="sr-only"> (obligatoire)</span></label>
        <input
          id={`${id}-email`}
          ref={inputRef}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
          className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {showError && <p id={`${id}-error`} className="text-sm text-red-700">{errorText}</p>}
        <button
          type="submit"
          aria-disabled={busy || undefined}
          className={`w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {busy ? "Envoi…" : "Recevoir un nouveau lien"}
        </button>
      </form>
      <p role="status" aria-live="polite" className={`text-sm ${failed ? "text-red-700" : "text-gray-700"}`}>{message}</p>
    </div>
  )
}
