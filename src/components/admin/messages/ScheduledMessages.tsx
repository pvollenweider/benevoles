"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState, useTransition } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import ModalShell from "../ModalShell"
import { announce } from "@/lib/announce"
import type { ScheduledMessageItem } from "@/lib/message-history-data"

/**
 * « Messages programmés » (#1019): the messages of the event set to leave later, soonest first,
 * each with « Annuler l'envoi » until the cron takes it; then the cancelled or skipped ones, with
 * their state in words. The heading is always there (focus target), and one status region for the
 * whole section survives the refresh after a cancel.
 */
export default function ScheduledMessages({ eventId, items, timeZone }: { eventId: string; items: ScheduledMessageItem[]; timeZone: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<ScheduledMessageItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const keepRef = useRef<HTMLButtonElement>(null)
  // The item whose heading keeps the focus across the refresh: a cancelled item moves down the
  // list, and React re-inserting its node drops the focus to <body>.
  const [focusId, setFocusId] = useState<string | null>(null)
  // The cron took it meanwhile: the list is refreshed, and closing the dialog lands on the item.
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (!focusId) return
    const el = document.getElementById(`scheduled-${focusId}`)
    if (el && (document.activeElement === document.body || document.activeElement === null || document.activeElement === el)) el.focus()
  }, [items, focusId])

  const focusItem = (id: string) => {
    setFocusId(id)
    document.getElementById(`scheduled-${id}`)?.focus()
  }

  function closeDialog() {
    if (busy) return
    const item = confirm
    flushSync(() => setConfirm(null))
    if (stale && item) focusItem(item.id)
    setStale(false)
  }

  async function cancel(item: ScheduledMessageItem) {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/scheduled-messages/${item.id}/cancel`, { method: "POST" }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res || !res.ok) {
      // Kept open: the reason is read in the dialog, focus stays on its buttons.
      setError(typeof data?.error === "string" ? data.error : "L'envoi programmé n'a pas pu être annulé.")
      if (res?.status === 409) { setStale(true); startTransition(() => router.refresh()) }
      return
    }
    // The item stays listed (now « Annulé »): its heading takes the focus, the button is gone.
    flushSync(() => setConfirm(null))
    focusItem(item.id)
    announce(setStatus, `Envoi programmé de « ${item.subject} » annulé.`)
    startTransition(() => router.refresh())
  }

  return (
    <section aria-labelledby="scheduled-messages-heading" className="space-y-3">
      <h2 id="scheduled-messages-heading" tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">Messages programmés</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-700">Aucun envoi programmé pour cet événement.</p>
      ) : (
        <ol role="list" className="space-y-3">
          {items.map((m) => (
            <li key={m.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <article aria-labelledby={`scheduled-${m.id}`}>
                <h3 id={`scheduled-${m.id}`} tabIndex={-1} className="font-medium text-gray-900 break-words focus:outline-none">{m.subject}</h3>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-gray-600">Programmé pour</dt>
                  <dd className="text-gray-900">le <time dateTime={m.scheduledFor}>{m.when}</time> <span className="text-gray-700">({timeZone})</span>, par {m.authorName}</dd>
                  <dt className="text-gray-600">À</dt>
                  <dd className="text-gray-900">{m.audienceLabel}, recalculé au moment de l&apos;envoi</dd>
                  <dt className="text-gray-600">État</dt>
                  <dd className="text-gray-900">{m.state}</dd>
                </dl>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    Voir le texte<span className="sr-only"> : « {m.subject} »</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{m.message}</p>
                </details>
                {m.pending && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => { setError(null); setStale(false); setFocusId(null); setConfirm(m) }}
                      className="text-sm font-medium text-red-700 underline underline-offset-2 hover:text-red-900 rounded px-1 py-1 -mx-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Annuler l&apos;envoi<span className="sr-only"> : « {m.subject} »</span>
                    </button>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
      <p role="status" className="text-sm text-gray-700">{status}</p>

      {confirm && (
        <ModalShell
          title="Annuler cet envoi programmé ?"
          role="alertdialog"
          onClose={closeDialog}
          initialFocusRef={keepRef}
          describedBy={error ? "scheduled-cancel-text scheduled-cancel-error" : "scheduled-cancel-text"}
          closeOnBackdrop={false}
          busy={busy}
        >
          <div className="space-y-4" aria-busy={busy}>
            <p id="scheduled-cancel-text" className="text-sm text-gray-800">
              « {confirm.subject} » ne partira pas le {confirm.when} ({timeZone}), à {confirm.audienceLabel}. Il restera listé comme annulé.
            </p>
            {error && <p id="scheduled-cancel-error" role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}
            <div className="flex gap-3 justify-end flex-wrap">
              <button ref={keepRef} type="button" aria-disabled={busy || undefined} onClick={closeDialog} className="text-sm text-gray-700 px-3 py-2 rounded hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Garder l&apos;envoi</button>
              <button type="button" aria-disabled={busy || undefined} onClick={() => cancel(confirm)} className={`bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${busy ? "opacity-50" : ""}`}>
                {busy ? "Annulation…" : "Annuler l'envoi"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </section>
  )
}
