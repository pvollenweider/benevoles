"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

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
  const [result, setResult] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const disabled = volunteerCount === 0

  async function send() {
    setSubmitting(true)
    setResult(null)
    const res = await fetch(`/api/admin/events/${eventId}/send-reminder`, { method: "POST" })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setResult(typeof data?.error === "string" ? data.error : "Erreur lors de l'envoi")
      return
    }
    const data = await res.json()
    setResult(`${data.sent} rappel${data.sent > 1 ? "s" : ""} envoyé${data.sent > 1 ? "s" : ""}${data.failed ? ` · ${data.failed} échec${data.failed > 1 ? "s" : ""}` : ""}`)
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📧 Envoyer le rappel ({volunteerCount} bénévole{volunteerCount > 1 ? "s" : ""})
      </button>
      {lastSentAt && (
        <span className="text-xs text-gray-400">
          Dernier envoi {formatRelative(lastSentAt)}
        </span>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Envoyer le rappel ?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Un email sera envoyé à <strong>{volunteerCount} bénévole{volunteerCount > 1 ? "s" : ""}</strong>.
              Chacun recevra ses créneaux et le message de rappel configuré dans l&apos;event.
            </p>
            {!hasMessage && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800 mb-4">
                ⚠ Le message de rappel est vide. L&apos;email contiendra uniquement le récap des créneaux.
                <br />
                <a href={`/admin/events/${eventId}/edit`} className="underline">Ajouter un message</a>
              </div>
            )}
            {result && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 mb-4">{result}</div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="text-sm px-4 py-2 text-gray-600 hover:text-gray-900">
                {result ? "Fermer" : "Annuler"}
              </button>
              {!result && (
                <button
                  onClick={send}
                  disabled={submitting}
                  className="bg-orange-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-orange-700 disabled:opacity-50"
                >
                  {submitting ? "Envoi…" : "Envoyer"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
