"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { requireTokenPath } from "@/lib/token-path"

/**
 * « Retrouver toutes mes inscriptions » on an event's personal page (#1429, lot A): the old link
 * only emails the organisation-wide link to the known address. It never displays or returns it,
 * and the answer is the same whatever happens behind the request.
 */
export default function AllRegistrationsLinkCard({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function send() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setFailed(false)
    try {
      const res = await fetch(requireTokenPath("/api/public/registrations", token, "/org-link"), { method: "POST" })
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
    <section aria-labelledby="all-registrations-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <h2 id="all-registrations-title" className="text-sm font-semibold text-gray-900">Retrouver toutes mes inscriptions</h2>
      <p className="text-sm text-gray-700">
        Un seul lien pour toutes tes inscriptions auprès de l&apos;organisation, sur tous ses événements.
      </p>
      <button
        type="button"
        onClick={send}
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        className="text-sm font-medium text-blue-700 border border-blue-600 rounded-lg px-3 py-1.5 min-h-11 hover:bg-blue-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {busy ? "Envoi…" : "Recevoir ce lien par email"}
      </button>
      <p role="status" aria-live="polite" className={`text-sm ${failed ? "text-red-700" : "text-gray-700"}`}>{message}</p>
    </section>
  )
}
