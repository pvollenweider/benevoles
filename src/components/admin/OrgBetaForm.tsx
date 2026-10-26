"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { announce } from "@/lib/announce"
import FormStatus from "@/components/FormStatus"
import Switch from "@/components/public/Switch"
import { BETA_NOTHING_OPEN_ERROR, BETA_SWITCH_LABEL, betaStateSentence, betaSwitchHint, type BetaParticipation } from "@/lib/beta-capabilities"

type Capability = { id: string; label: string; description: string }

/**
 * Beta access (#1168), Paramètres, owners only: the organisation joins or leaves the beta. An
 * immediate on/off setting, so the shared switch (DESIGN.md §5 « Interrupteur »): its name never
 * changes, its state flips only once the server agreed, and it stays mounted so the focus stays
 * on it. The hint says what turning it off does (nothing already used changes); the result is said
 * once by the status line, a failure by the alert. The page renders the card only while something
 * is open or the organisation takes part (betaCardVisible).
 */
export default function OrgBetaForm({ initial, capabilities, timeZone, contact }: {
  initial: BetaParticipation
  capabilities: Capability[]
  timeZone: string
  contact: string | null
}) {
  const [state, setState] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const somethingOpen = capabilities.length > 0
  // Joining needs something open; the switch stays in place (focus) but does nothing then.
  const locked = !state.optedIn && !somethingOpen

  async function toggle() {
    if (saving || locked) return
    const optIn = !state.optedIn
    setSaving(true)
    setStatus("")
    setError("")
    try {
      const res = await fetch("/api/admin/settings/organization/beta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setState({ optedIn: !!data.optedIn, optedInAt: data.optedInAt ?? null, optedInByName: data.optedInByName ?? null })
        announce(setStatus, data.optedIn
          ? "Votre organisation participe à la bêta."
          : "Votre organisation ne participe plus à la bêta : ce que vos événements utilisent déjà continue de fonctionner.")
      } else {
        announce(setError, typeof data.error === "string" ? data.error : res.status === 409 ? BETA_NOTHING_OPEN_ERROR : "Le paramètre n'a pas pu être enregistré. Réessayez.")
      }
    } catch {
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    setSaving(false)
  }

  return (
    <section aria-labelledby="org-beta-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <h2 id="org-beta-title" className="text-sm font-semibold text-gray-800">Fonctions bêta</h2>
      <p className="text-sm text-gray-800">{betaStateSentence(state, timeZone)}</p>
      <p className="text-sm text-gray-700">Des fonctions encore en cours de mise au point, que vous pouvez essayer avant leur sortie pour tous.</p>
      {somethingOpen ? (
        <>
          <p id="org-beta-list-title" className="text-sm text-gray-700">Ce que la bêta vous permet d&apos;essayer :</p>
          <ul aria-labelledby="org-beta-list-title" className="list-disc pl-5 text-sm text-gray-800 space-y-1">
            {capabilities.map((c) => (
              <li key={c.id}><strong className="font-semibold">{c.label}</strong> : {c.description.charAt(0).toLowerCase() + c.description.slice(1)}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-gray-700">Aucune fonction bêta n&apos;est ouverte à l&apos;essai pour le moment.</p>
      )}
      <div>
        <Switch
          checked={state.optedIn}
          busy={saving || locked}
          onToggle={() => void toggle()}
          describedBy={`org-beta-hint${error ? " org-beta-error" : ""}`}
        >
          {BETA_SWITCH_LABEL}
        </Switch>
        <p id="org-beta-hint" className="text-xs text-gray-600">{betaSwitchHint(state.optedIn, somethingOpen)}</p>
      </div>
      {/* Visible only: the result is said once by the status line (DESIGN.md). */}
      {saving && <p className="text-sm text-gray-700">Enregistrement…</p>}
      <FormStatus status={status} error={error} errorId="org-beta-error" />
      {/* Outside the hint: the switch's description must not read the link. */}
      {contact && (
        <p className="text-sm text-gray-700">
          Une remarque, un problème ? Écrivez-nous à{" "}
          <a href={`mailto:${contact}`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{contact}</a>.
        </p>
      )}
    </section>
  )
}
