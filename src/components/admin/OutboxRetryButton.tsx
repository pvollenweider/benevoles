"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * « Renvoyer » a permanently failed notification (#382): re-queues it, then the list refreshes.
 * Rendered for every row so the status message and the focus survive the refresh that turns
 * the row from « échec » to « en attente » (the button itself only shows while it can retry).
 */
export default function OutboxRetryButton({ id, recipient, canRetry }: { id: string; recipient: string; canRetry: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const statusRef = useRef<HTMLSpanElement>(null)

  async function retry() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/settings/notifications/${id}/retry`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error ?? "Le renvoi n'a pas pu être programmé.")
        return
      }
      setMessage("Renvoi programmé : l'email repart dans la minute.")
      // The button disappears with the refresh: park the focus on the message first.
      statusRef.current?.focus()
      router.refresh()
    } catch {
      setMessage("Connexion impossible. Réessayez.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {canRetry && (
        <button
          type="button"
          onClick={retry}
          aria-disabled={busy || undefined}
          className={`text-xs font-medium text-blue-700 border border-blue-300 rounded-lg px-2.5 py-1 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {busy ? "Envoi…" : "Renvoyer"}<span className="sr-only"> à {recipient}</span>
        </button>
      )}
      <span ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="text-xs text-gray-700 focus:outline-none">{message}</span>
    </span>
  )
}
