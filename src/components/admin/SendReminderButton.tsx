"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState, useTransition } from "react"
import { flushSync } from "react-dom"
import { requestJson } from "@/lib/use-submit"
import { useRouter } from "next/navigation"
import ModalShell from "./ModalShell"

type Props = {
  eventId: string
  hasMessage: boolean
  volunteerCount: number
  lastSentAt: string | null
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `il y a ${days} j`
  return date.toLocaleDateString("fr-FR")
}

export default function SendReminderButton({ eventId, hasMessage, volunteerCount, lastSentAt }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [, startTransition] = useTransition()
  // Confirmation of a send-to-many action: focus the safe choice first.
  const cancelRef = useRef<HTMLButtonElement>(null)

  const disabled = volunteerCount === 0

  async function send() {
    if (submitting) return
    setSubmitting(true)
    setResult(null)
    const outcome = await requestJson<{ sent: number; failed?: number }>(() => fetch(`/api/admin/events/${eventId}/send-reminder`, { method: "POST" }), "Le rappel n'a pas pu être envoyé.")
    setSubmitting(false)
    if (!outcome.ok) {
      setResult({ kind: "error", text: outcome.error })
      return
    }
    const data = outcome.data
    // « Envoyer » disappears with the success: commit first, then park the focus on « Fermer ».
    flushSync(() => setResult({ kind: "ok", text: `${data.sent} rappel${data.sent > 1 ? "s" : ""} envoyé${data.sent > 1 ? "s" : ""}${data.failed ? ` · ${data.failed} échec${data.failed > 1 ? "s" : ""}` : ""}` }))
    cancelRef.current?.focus()
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* Manual reminder */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-700">Rappel ponctuel manuel</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Envoie un message libre à tous les bénévoles inscrits, en plus des rappels automatiques.
          Utile pour transmettre des infos de dernière minute, un point de rendez-vous, ou toute communication urgente.
          {!hasMessage && !disabled && (
            <> <a href={`/admin/events/${eventId}/edit`} className="text-blue-600 underline underline-offset-2">Configurer le message</a> dans les paramètres de l&apos;événement.</>
          )}
        </p>
        <button
          type="button"
          onClick={() => { setResult(null); setOpen(true) }}
          disabled={disabled}
          className="self-start bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          📧 Envoyer le rappel ({volunteerCount} bénévole{volunteerCount > 1 ? "s" : ""})
        </button>
        {lastSentAt && (
          <span className="text-xs text-gray-500">Dernier envoi {formatRelative(lastSentAt)}</span>
        )}
      </div>

      {open && (
        <ModalShell
          title="Envoyer le rappel ?"
          onClose={() => { if (!submitting) setOpen(false) }}
          panelClassName="max-w-md"
          initialFocusRef={cancelRef}
          describedBy="send-reminder-description"
        >
          <p id="send-reminder-description" className="text-sm text-gray-600 mb-4">
            Un email individuel sera envoyé à chaque bénévole inscrit
            (<strong>{volunteerCount} destinataire{volunteerCount > 1 ? "s" : ""}</strong>).
            Chaque email contient le récapitulatif personnel des créneaux de la personne,
            suivi du message de rappel configuré sur l&apos;événement.
          </p>
          {!hasMessage && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
              ⚠ Le message de rappel est vide. L&apos;email contiendra uniquement le récap des créneaux.
              <br />
              <a href={`/admin/events/${eventId}/edit`} className="underline">Ajouter un message</a>
            </div>
          )}
          <div role="status" className={result?.kind === "ok" ? "bg-gray-50 rounded-lg p-3 text-sm text-gray-700 mb-4" : "sr-only"}>{result?.kind === "ok" ? result.text : ""}</div>
          <div role="alert" className={result?.kind === "error" ? "bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 mb-4" : "sr-only"}>{result?.kind === "error" ? result.text : ""}</div>
          <div className="flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => { if (!submitting) setOpen(false) }}
              aria-disabled={submitting || undefined}
              className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              {result?.kind === "ok" ? "Fermer" : "Annuler"}
            </button>
            {result?.kind !== "ok" && (
              <button
                type="button"
                onClick={send}
                aria-disabled={submitting || undefined}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-full font-medium hover:bg-blue-700 aria-disabled:cursor-wait transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                {submitting ? "Envoi…" : result ? "Réessayer" : "Envoyer"}
              </button>
            )}
            {/* The label change of the focused button isn't reliably voiced: say it once, politely. */}
            <span role="status" className="sr-only">{submitting ? "Envoi en cours…" : ""}</span>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
