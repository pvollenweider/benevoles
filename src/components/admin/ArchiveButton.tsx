"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Archives a published or draft event (PATCH publicStatus). Once archived the event can be deleted
 * for good from the « Suppression définitive » section of its Réglages page. A row of the event
 * header's « ⋯ » panel: `onDone` hands the outcome to the header, which announces it and moves the
 * focus, since this unmounts with the panel.
 */
export default function ArchiveButton({ eventId, currentStatus, onDone }: { eventId: string; currentStatus: string; onDone?: (message: string) => void }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const id = useId()

  const isArchived = currentStatus === "archived"

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (restoreFocus.current) {
      openerRef.current?.focus()
      restoreFocus.current = false
    }
  }, [confirming])

  function cancel() {
    if (loading) return
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
      onDone?.("Événement archivé.")
      router.refresh()
    } catch {
      setError("Impossible d'archiver l'événement. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      {!isArchived &&
        (confirming ? (
          <div
            role="alertdialog"
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-desc`}
            onKeyDown={(e) => {
              // preventDefault: the « ⋯ » panel around leaves an Escape already handled here alone.
              if (e.key === "Escape") { e.preventDefault(); cancel() }
            }}
            className="flex flex-col gap-2 bg-yellow-50 border border-yellow-300 rounded-xl px-3 py-2"
          >
            <span id={`${id}-label`} className="text-sm text-yellow-900 font-semibold">Archiver cet événement ?</span>
            <span id={`${id}-desc`} className="text-xs text-yellow-900">
              Il ne sera plus visible du public. Vous pourrez ensuite le supprimer définitivement depuis ses réglages.
            </span>
            <div className="flex items-center gap-2">
              <button
                ref={confirmRef}
                type="button"
                onClick={() => { if (!loading) void archive() }}
                aria-disabled={loading || undefined}
                className="text-sm min-h-9 bg-yellow-800 text-white px-3 py-1 rounded-full font-medium hover:bg-yellow-900 aria-disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
              >
                {loading ? "Archivage…" : "Confirmer"}
              </button>
              <button
                type="button"
                onClick={cancel}
                aria-disabled={loading || undefined}
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
            className="flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
          >
            Archiver
          </button>
        ))}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
