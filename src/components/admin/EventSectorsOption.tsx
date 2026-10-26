"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import Link from "next/link"
import { announce } from "@/lib/announce"
import Switch from "@/components/public/Switch"
import { SECTORS_ADOPTED_NOTICE, SECTORS_OPTION_HINT, SECTORS_OPTION_LABEL } from "@/lib/sectors"

/**
 * « Organiser les postes par secteurs » (#1147, beta), on the event's information page: an
 * immediate switch (DESIGN.md, « Interrupteur ») saved by its own route, apart from the autosaved
 * event form. Its state flips only once the server agreed. Once the event adopted sectors (a first
 * sector saved), the switch gives way to the sentence saying it can no longer be turned off.
 */
export default function EventSectorsOption({ eventId, initialEnabled, adopted }: { eventId: string; initialEnabled: boolean; adopted: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const shiftsLink = `/admin/events/${eventId}/shifts`

  async function toggle() {
    if (saving) return
    const next = !enabled
    setSaving(true)
    setStatus("")
    setError("")
    try {
      const res = await fetch(`/api/admin/events/${eventId}/sectors/mode`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setEnabled(!!data.sectorsEnabled)
        announce(setStatus, data.sectorsEnabled
          ? "Secteurs activés : créez-les dans Créneaux, « Gérer les postes »."
          : "Secteurs désactivés : l'événement garde ses postes et ses créneaux, sans secteur.")
      } else {
        announce(setError, typeof data.error === "string" ? data.error : "Le paramètre n'a pas pu être enregistré. Réessayez.")
      }
    } catch {
      announce(setError, "Le paramètre n'a pas pu être enregistré. Vérifiez votre connexion, puis réessayez.")
    }
    setSaving(false)
  }

  return (
    <section aria-labelledby="event-sectors-title" className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2" data-event-sectors="1">
      <h2 id="event-sectors-title" className="text-base font-semibold text-gray-900">
        Secteurs <span className="ml-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">bêta</span>
      </h2>
      {adopted ? (
        <>
          <p className="text-sm text-gray-800">{SECTORS_ADOPTED_NOTICE}</p>
          <p className="text-sm">
            <Link href={shiftsLink} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Organiser les secteurs dans Créneaux</Link>
          </p>
        </>
      ) : (
        <>
          <Switch checked={enabled} onToggle={toggle} busy={saving} describedBy={error ? "event-sectors-hint event-sectors-error" : "event-sectors-hint"} data-sectors-switch="1">
            {SECTORS_OPTION_LABEL}
          </Switch>
          <p id="event-sectors-hint" className="text-xs text-gray-600">
            {SECTORS_OPTION_HINT} {enabled
              ? "Tant qu'aucun secteur n'est enregistré, vous pouvez désactiver cette option."
              : "Une fois le premier secteur enregistré, cette organisation ne peut plus être désactivée."}
          </p>
          {enabled && (
            <p className="text-sm">
              <Link href={shiftsLink} className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Organiser les secteurs dans Créneaux</Link>
            </p>
          )}
          <p role="status" className={status ? "text-sm text-green-800" : "sr-only"}>{status}</p>
          <p id="event-sectors-error" role="alert" className={error ? "text-sm text-red-700" : "sr-only"}>{error}</p>
        </>
      )}
    </section>
  )
}
