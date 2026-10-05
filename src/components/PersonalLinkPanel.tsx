"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { lastLinkEmailLabel, PERSONAL_LINK_NOTICE } from "@/lib/personal-link"
import { orgContactHref } from "@/lib/mission-brief"
import { ORG_CONTACT_LABEL } from "@/lib/shift-info"

type Props = {
  token: string
  linkEmailedAt: string | null
  timeZone: string
  contactEmail: string | null
  eventTitle: string
}

/**
 * The personal link explained on the personal page (#376): private, when it was last emailed,
 * a button to get it again, and how to reach the organization.
 */
export default function PersonalLinkPanel({ token, linkEmailedAt, timeZone, contactEmail, eventTitle }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function resend() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    setFailed(false)
    try {
      const res = await fetch(`/api/public/registrations/${token}/resend-link`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      setFailed(!res.ok)
      setMessage(data.message ?? data.error ?? (res.ok ? "Email envoyé." : "L'email n'a pas pu être envoyé. Réessaie plus tard."))
    } catch {
      setFailed(true)
      setMessage("Connexion impossible. Vérifie ton réseau et réessaie.")
    } finally {
      setBusy(false)
    }
  }

  const last = lastLinkEmailLabel(linkEmailedAt, timeZone)
  return (
    <section aria-labelledby="personal-link-title" className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <h2 id="personal-link-title" className="text-xs font-semibold text-gray-600">Ton lien personnel</h2>
      <p className="text-sm text-gray-800">{PERSONAL_LINK_NOTICE}</p>
      <p className="text-xs text-gray-600">{last ?? "Ce lien t'a été envoyé par email à l'inscription."}</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={resend}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className={`text-sm font-medium text-blue-700 border border-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-70 cursor-not-allowed" : ""}`}
        >
          {busy ? "Envoi…" : "Recevoir ce lien par email"}
        </button>
        {contactEmail && (
          <a
            href={orgContactHref(contactEmail, eventTitle)}
            className="text-sm text-blue-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {ORG_CONTACT_LABEL}
          </a>
        )}
      </div>
      <p role="status" aria-live="polite" className={`text-sm ${failed ? "text-red-700" : "text-gray-700"}`}>{message}</p>
    </section>
  )
}
