"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { statusBoxClass } from "@/lib/status-message"

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const PRIMARY = `inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 aria-disabled:opacity-50 ${FOCUS}`
const MENU_ITEM = "flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 aria-disabled:opacity-50"

/**
 * Publish / unpublish an event. In a space awaiting validation (#810) the button becomes
 * « Demander la publication »: it tells the operator and shows when publishing becomes possible.
 * `variant="menu"`: a row of the event header's « ⋯ » panel (« Dépublier »), with its inline
 * confirmation; `onDone` then says what happened, so the header announces it once this unmounts.
 */
export default function PublishToggle({
  eventId, currentStatus, awaitingValidation = false, variant = "primary", onDone,
}: {
  eventId: string
  currentStatus: string
  awaitingValidation?: boolean
  variant?: "primary" | "menu"
  onDone?: (message: string) => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [requested, setRequested] = useState<string | null>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const id = useId()

  const isPublished = currentStatus === "published"

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (restoreFocus.current) {
      openerRef.current?.focus()
      restoreFocus.current = false
    }
  }, [confirming])

  async function requestPublication() {
    // Once sent, the button says so and does nothing more: the operator already has it.
    if (loading || requested) return
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/publication-request`, { method: "POST" }).catch(() => null)
    setLoading(false)
    const data = res ? await res.json().catch(() => ({})) : null
    if (!res?.ok) {
      setError(typeof data?.error === "string" ? data.error : "La demande n'a pas pu être envoyée. Réessayez.")
      return
    }
    setRequested(typeof data?.message === "string" ? data.message : "Demande envoyée.")
  }

  if (awaitingValidation && !isPublished) {
    return (
      <div className={`flex flex-col items-end gap-1 max-w-md ${requested ? "basis-full" : ""}`}>
        <button
          type="button"
          onClick={() => void requestPublication()}
          aria-disabled={loading || !!requested || undefined}
          aria-describedby={requested ? `publish-request-${eventId}` : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-medium ${FOCUS} ${requested ? "bg-gray-100 text-gray-800 cursor-default" : "bg-blue-600 text-white hover:bg-blue-700"} ${loading ? "cursor-wait" : ""}`}
        >
          {requested ? "Demande envoyée" : "Demander la publication"}{loading && <span className="sr-only"> (en cours)</span>}
        </button>
        <p id={`publish-request-${eventId}`} aria-live="polite" aria-atomic="true" className={requested ? statusBoxClass("success") : "sr-only"}>{requested ?? ""}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    )
  }

  function cancel() {
    if (loading) return
    restoreFocus.current = true
    setConfirming(false)
  }

  async function doToggle() {
    if (loading) return
    const newStatus = isPublished ? "draft" : "published"
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicStatus: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.error === "string" ? data.error : "")
      }
      setConfirming(false)
      onDone?.(newStatus === "published" ? "Événement publié." : "Événement dépublié : il repasse en brouillon.")
      router.refresh()
      // The page changes under the user (and this button may unmount): land on the heading,
      // unless the header puts the focus somewhere itself (onDone).
      if (!onDone) document.getElementById("page-heading")?.focus()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Impossible de modifier le statut. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${variant === "menu" ? "items-stretch" : "items-end"}`}>
      {confirming ? (
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
          <span id={`${id}-label`} className="text-sm text-yellow-900 font-semibold">Dépublier ?</span>
          <span id={`${id}-desc`} className="text-xs text-yellow-900">La page d&apos;inscription se ferme et l&apos;événement repasse en brouillon. Les inscriptions déjà faites sont gardées.</span>
          <div className="flex items-center gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={() => void doToggle()}
              aria-disabled={loading || undefined}
              className="text-sm min-h-9 bg-yellow-800 text-white px-3 py-1 rounded-full font-medium hover:bg-yellow-900 aria-disabled:opacity-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
            >
              {loading ? "Dépublication…" : "Confirmer"}
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
          onClick={() => (isPublished ? setConfirming(true) : void doToggle())}
          aria-disabled={loading || undefined}
          className={variant === "menu" ? MENU_ITEM : isPublished ? `inline-flex min-h-11 items-center rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-800 hover:bg-gray-50 aria-disabled:opacity-50 ${FOCUS}` : PRIMARY}
        >
          {isPublished ? "Dépublier" : "Publier"}{loading && <span className="sr-only"> (en cours)</span>}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
