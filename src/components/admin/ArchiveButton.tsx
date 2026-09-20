"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Archives a published or draft event (PATCH publicStatus). Once archived the
 * event can be deleted for good from the section at the bottom of the page.
 * The component stays mounted after archiving so its status message is announced.
 */
export default function ArchiveButton({ eventId, currentStatus }: { eventId: string; currentStatus: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const openerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  const isArchived = currentStatus === "archived"

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (restoreFocus.current) {
      openerRef.current?.focus()
      restoreFocus.current = false
    }
  }, [confirming])

  function cancel() {
    restoreFocus.current = true
    setConfirming(false)
  }

  async function archive() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicStatus: "archived" }),
      })
      if (!res.ok) throw new Error()
      setConfirming(false)
      setMessage("Événement archivé.")
      router.refresh()
    } catch {
      setError("Impossible d'archiver l'événement. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {!isArchived &&
        (confirming ? (
          <div
            role="alertdialog"
            aria-labelledby="archive-confirm-label"
            aria-describedby="archive-confirm-desc"
            onKeyDown={(e) => {
              if (e.key === "Escape") cancel()
            }}
            className="flex flex-col gap-2 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2 max-w-xs"
          >
            <span id="archive-confirm-label" className="text-sm text-yellow-900 font-semibold">Archiver cet événement ?</span>
            <span id="archive-confirm-desc" className="text-xs text-yellow-900">
              Il ne sera plus visible du public. Vous pourrez ensuite le supprimer définitivement.
            </span>
            <div className="flex items-center gap-2">
              <button
                ref={confirmRef}
                type="button"
                onClick={archive}
                disabled={loading}
                className="text-sm min-h-9 bg-yellow-700 text-white px-3 py-1 rounded-full font-medium hover:bg-yellow-800 disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                {loading ? "Archivage…" : "Confirmer"}
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={loading}
                className="text-sm min-h-9 px-2 text-yellow-900 underline hover:text-yellow-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            ref={openerRef}
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm px-3 py-1.5 rounded-full font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            Archiver
          </button>
        ))}
      <p role="status" className="sr-only">{message}</p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
