"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import FormStatus from "@/components/FormStatus"
import { useSubmit } from "@/lib/use-submit"

const resendText = (n: number) => (n > 1 ? `Renvoyer les ${n} emails en échec` : "Renvoyer l'email en échec")

/** « Renvoyer les N emails en échec » of one targeted message (#467). */
export default function ResendFailedButton({ eventId, messageId, count, subject }: { eventId: string; messageId: string; count: number; subject: string }) {
  const { submit, busy, error, status, setStatus } = useSubmit()
  const [done, setDone] = useState(false)

  async function resend() {
    if (busy || done) return
    const outcome = await submit<{ resent: number }>(() => fetch(`/api/admin/events/${eventId}/messages/${messageId}/resend-failed`, { method: "POST" }), { fallback: "Impossible de renvoyer les emails en échec." })
    if (!outcome.ok) return
    setDone(true)
    const n = outcome.data.resent
    setStatus(n === 0 ? "Rien à renvoyer : ces emails ont déjà été remis en file." : `${n} email${n > 1 ? "s" : ""} remis en file d'envoi. La remise sera à jour au prochain chargement de la page.`)
  }

  return (
    <div className="space-y-1">
      {/* Stays in place once used (no refresh), so focus and the status stay where they are. */}
      <button
          type="button"
          onClick={resend}
          aria-disabled={busy || done || undefined}
          className={`text-sm font-medium rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${done ? "text-gray-700" : "text-blue-700 underline underline-offset-2 hover:text-blue-900"} ${busy ? "opacity-60 cursor-wait" : ""}`}
        >
          {busy ? "Renvoi en cours…" : done ? "Remis en file" : resendText(count)}
          {/* The visible text always starts the name (2.5.3); the subject tells the messages apart. */}
          <span className="sr-only"> : message « {subject} »</span>
        </button>
      <FormStatus status={status} error={error} />
    </div>
  )
}
