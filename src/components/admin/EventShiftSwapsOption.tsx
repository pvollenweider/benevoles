"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import Link from "next/link"
import { announce } from "@/lib/announce"
import Switch from "@/components/public/Switch"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { SWAPS_APPROVAL_HINT, SWAPS_APPROVAL_LABEL, SWAPS_OPTION_HINT, SWAPS_OPTION_LABEL } from "@/lib/shift-swap-text"

/**
 * « Échanges de créneaux » (#1174, beta), on the event's information page, like the sectors card:
 * immediate switches saved by their own route, apart from the autosaved event form, whose state
 * flips only once the server agreed. Turning swaps off while requests are under way asks first:
 * the server answers 409 with how many, counted under its lock, and the confirmation sends again.
 * « Valider chaque échange » appears once swaps are on.
 */
export default function EventShiftSwapsOption({ eventId, initialEnabled, initialApproval }: { eventId: string; initialEnabled: boolean; initialApproval: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [approval, setApproval] = useState(initialApproval)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const [confirmOff, setConfirmOff] = useState<{ text: string } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function save(body: { enabled?: boolean; approval?: boolean; confirm?: boolean }): Promise<boolean> {
    setSaving(true)
    setStatus("")
    setError("")
    try {
      const res = await fetch(`/api/admin/events/${eventId}/swaps/mode`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      setSaving(false)
      if (res.ok) {
        setEnabled(!!data.shiftSwapsEnabled)
        setApproval(!!data.shiftSwapsApproval)
        if (body.enabled === true) announce(setStatus, "Demandes d'échange autorisées. Vous pouvez aussi faire valider chaque échange.")
        else if (body.enabled === false) announce(setStatus, "Échanges désactivés : les bénévoles ne peuvent plus en demander.")
        else announce(setStatus, data.shiftSwapsApproval ? "Chaque échange attendra votre validation." : "Seuls les échanges qui touchent un créneau sur validation attendront votre accord.")
        return true
      }
      if (res.status === 409 && typeof data.openCount === "number") {
        setConfirmError(null)
        setConfirmOff({ text: typeof data.error === "string" ? data.error : "" })
        return false
      }
      announce(setError, typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez.")
    } catch {
      setSaving(false)
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    return false
  }

  async function confirmSwitchOff() {
    setSaving(true)
    setConfirmError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}/swaps/mode`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false, confirm: true }) })
      const data = await res.json().catch(() => ({}))
      setSaving(false)
      if (!res.ok) { setConfirmError(typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez."); return }
      setEnabled(false)
      setConfirmOff(null)
      announce(setStatus, "Échanges désactivés : les demandes en cours sont annulées et les personnes prévenues.")
    } catch {
      setSaving(false)
      setConfirmError("La connexion a échoué : rien n'a été fait. Réessayez.")
    }
  }

  return (
    <section aria-labelledby="event-swaps-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2" data-event-swaps="1">
      <h2 id="event-swaps-title" className="text-base font-semibold text-gray-900">
        Échanges de créneaux <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">bêta</span>
      </h2>
      <Switch checked={enabled} onToggle={() => { if (!saving) void save({ enabled: !enabled }) }} busy={saving} describedBy={error ? "event-swaps-hint event-swaps-error" : "event-swaps-hint"} data-swaps-switch="1">
        {SWAPS_OPTION_LABEL}
      </Switch>
      <p id="event-swaps-hint" className="text-xs text-gray-600">{SWAPS_OPTION_HINT}</p>
      {enabled && (
        <>
          <Switch checked={approval} onToggle={() => { if (!saving) void save({ approval: !approval }) }} busy={saving} describedBy={error ? "event-swaps-approval-hint event-swaps-error" : "event-swaps-approval-hint"} data-swaps-approval-switch="1">
            {SWAPS_APPROVAL_LABEL}
          </Switch>
          <p id="event-swaps-approval-hint" className="text-xs text-gray-600">{SWAPS_APPROVAL_HINT}</p>
          <p className="text-sm">
            <Link href={`/admin/events/${eventId}/registrations#echanges`} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Voir les échanges dans Inscriptions</Link>
          </p>
        </>
      )}
      <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
      <p id="event-swaps-error" role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
      {confirmOff && (
        <ConfirmActionModal
          recap={{
            title: "Désactiver les échanges de créneaux ?",
            lead: confirmOff.text,
            lines: ["Les échanges déjà effectués restent.", "L'action est journalisée : vous la retrouverez dans le journal de l'événement."],
            confirmLabel: "Désactiver et annuler les demandes",
            cancelLabel: "Garder les échanges",
            danger: true,
          }}
          busy={saving}
          error={confirmError}
          onConfirm={() => void confirmSwitchOff()}
          onCancel={() => setConfirmOff(null)}
        />
      )}
    </section>
  )
}
