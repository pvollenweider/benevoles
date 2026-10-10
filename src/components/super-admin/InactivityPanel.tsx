"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { NETWORK_ERROR } from "@/lib/use-submit"
import { announce } from "@/lib/announce"
import { POSTPONE_MONTHS } from "@/lib/org-inactivity"
import FormStatus from "@/components/FormStatus"

/**
 * The operator's hand on the periodic check of inactive organisations (#811), on the
 * organisation's page: postpone it by 3, 6 or 12 months, cancel the postponement, or exclude the
 * organisation for good. The status sentence comes from the server and is refreshed after each
 * change; the outcome is announced once by the status line.
 */
export default function InactivityPanel({ orgId, status, postponed, exempt, applies }: {
  orgId: string
  /** Where the organisation stands, in words (inactivityStatusText). */
  status: string
  /** A postponement still running. */
  postponed: boolean
  exempt: boolean
  /** False for a suspended or deactivated organisation: nothing to postpone. */
  applies: boolean
}) {
  const id = useId()
  const router = useRouter()
  const [months, setMonths] = useState<string>("6")
  const [sending, setSending] = useState(false)
  // The new labels arrive with the refreshed page: busy until then, so a second press can't resend.
  const [refreshing, startRefresh] = useTransition()
  const busy = sending || refreshing
  const submitRef = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("")

  async function send(body: Record<string, unknown>, done: string, after?: () => void) {
    if (busy) return
    setSending(true)
    setError(null)
    const res = await fetch(`/api/super-admin/organizations/${orgId}/inactivity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null)
    setSending(false)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => null) : null
      setError(data?.error ?? (res ? "Le changement n'a pas pu être enregistré." : NETWORK_ERROR))
      return
    }
    startRefresh(() => router.refresh())
    announce(setOutcome, done)
    after?.()
  }

  const button = "text-sm px-3 py-1.5 rounded-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <section aria-labelledby={`${id}-title`} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div>
        <h2 id={`${id}-title`} className="text-sm font-semibold text-gray-900">Vérification d&apos;inactivité</h2>
        <p className="text-sm text-gray-800 mt-1">{status}</p>
      </div>
      <FormStatus status={outcome} error={error} errorId={`${id}-error`} />
      {applies && !exempt && (
        <form
          onSubmit={(e) => { e.preventDefault(); void send({ postponeMonths: Number(months) }, `Vérification reportée de ${months} mois.`) }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-months`} className="text-xs font-semibold text-gray-700">Durée du report, à partir d&apos;aujourd&apos;hui</label>
            <select
              id={`${id}-months`}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            >
              {POSTPONE_MONTHS.map((m) => <option key={m} value={m}>{m} mois</option>)}
            </select>
          </div>
          <button ref={submitRef} type="submit" aria-disabled={busy || undefined} aria-describedby={error ? `${id}-error` : undefined} className={`${button} bg-gray-900 text-white hover:bg-gray-800 ${busy ? "cursor-wait" : ""}`}>
            Reporter
          </button>
          {postponed && (
            <button type="button" onClick={() => void send({ postponeMonths: null }, "Report annulé.", () => submitRef.current?.focus())} aria-disabled={busy || undefined} aria-describedby={error ? `${id}-error` : undefined} className={`${button} border border-gray-300 text-gray-800 hover:bg-gray-50 ${busy ? "cursor-wait" : ""}`}>
              Annuler le report
            </button>
          )}
        </form>
      )}
      {applies && (
        <button
          type="button"
          onClick={() => void send({ exempt: !exempt }, exempt ? "Vérification automatique rétablie." : "Cette organisation ne sera jamais désactivée automatiquement.")}
          aria-disabled={busy || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${button} border border-gray-300 text-gray-800 hover:bg-gray-50 ${busy ? "cursor-wait" : ""}`}
        >
          {exempt ? "Rétablir la vérification automatique" : "Ne jamais désactiver automatiquement"}
        </button>
      )}
    </section>
  )
}
