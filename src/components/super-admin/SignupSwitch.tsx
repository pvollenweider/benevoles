"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import { NETWORK_ERROR } from "@/lib/use-submit"
import { announce } from "@/lib/announce"
import FormStatus from "@/components/FormStatus"

type State = { open: boolean; closedBy: "config" | "operator" | null }

const STATE_TEXT: Record<"open" | "operator" | "config", string> = {
  open: "Les inscriptions sont ouvertes : une association peut demander un espace depuis la page d'inscription.",
  operator: "Les inscriptions sont fermées : la page d'inscription l'annonce avec l'adresse de contact de l'instance, et les liens de confirmation déjà envoyés ne créent plus d'espace.",
  config: "Les inscriptions sont fermées par la configuration du serveur (SIGNUP=off) : elles ne peuvent pas être rouvertes depuis cette page.",
}

/**
 * The « Inscriptions fermées » switch (#810): effective at once, no deploy. One button whose
 * label says what it does; the new state is announced once by the status line, and the focus
 * stays on the button (same element, new label).
 */
export default function SignupSwitch({ initial }: { initial: State }) {
  const id = useId()
  const [state, setState] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState("")

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    const closed = state.open
    const res = await fetch("/api/super-admin/signup-switch", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed }),
    }).catch(() => null)
    setBusy(false)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => null) : null
      setError(data?.error ?? (res ? "Le changement n'a pas pu être enregistré." : NETWORK_ERROR))
      return
    }
    const next = (await res.json()) as State
    setState(next)
    announce(setOutcome, next.open ? "Inscriptions rouvertes." : "Inscriptions fermées.")
  }

  const text = state.open ? STATE_TEXT.open : STATE_TEXT[state.closedBy ?? "operator"]

  return (
    <section aria-labelledby={`${id}-title`} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <h2 id={`${id}-title`} className="text-base font-semibold text-gray-900">Ouverture des inscriptions</h2>
      <p className="text-sm text-gray-800">{text}</p>
      <FormStatus status={outcome} error={error} errorId={`${id}-error`} />
      {state.closedBy !== "config" && (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-disabled={busy || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`text-sm px-4 py-2 rounded-xl font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${state.open ? "border border-red-300 text-red-700 hover:bg-red-50" : "bg-green-700 text-white hover:bg-green-800"} ${busy ? "cursor-wait" : ""}`}
        >
          {state.open ? "Fermer les inscriptions" : "Rouvrir les inscriptions"}
        </button>
      )}
    </section>
  )
}
