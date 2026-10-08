"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useLayoutEffect, useRef, useState } from "react"
import ModalShell from "@/components/admin/ModalShell"
import { useHydrated } from "@/lib/use-hydrated"

type Props = {
  token: string
  eventSlug: string
  /** Already declined on an earlier visit (#558): shows the acknowledgement instead of the button. */
  initialDeclined: boolean
  /** From the email's second link (`?decline=1`): opens the confirmation step right away. */
  autoOpen?: boolean
  /**
   * Where focus goes if the dialog disappears with nothing to return to (an auto-opened dialog has
   * no opener), e.g. this component unmounts because the visitor's session turned out to hold a
   * registration (#773 a11y review).
   */
  fallbackFocusOnClose?: () => HTMLElement | null
}

/**
 * « Je ne suis pas disponible pour cet événement » (#558): a visible button, then a confirmation
 * step — never a state change on a plain page load, so a link scanner in a mail client can't
 * answer for the person. No reason asked, no free text. Mirrors WithdrawDialog's shape (confirm
 * dialog, focus on « Non, annuler » first) but its own component: a different action, a different
 * audience state (declined vs. withdrawn), and no message field.
 */
export default function DeclineInvite({ token, eventSlug, initialDeclined, autoOpen, fallbackFocusOnClose }: Props) {
  // `initialDeclined` arrives asynchronously (the parent's own GET to member-invite resolves after
  // mount), so it is read on every render rather than only to seed useState: capturing it once
  // would freeze this component on its first value (false, before the fetch resolves) and ignore
  // the real answer once it arrives. `confirmedHere` only remembers a decline from this session.
  const [confirmedHere, setConfirmedHere] = useState(false)
  const declined = initialDeclined || confirmedHere
  // Opened from the button, or by `?decline=1` once hydrated: never in the server HTML (#773),
  // where the dialog would have neither its focus trap nor Escape. Closing it, either way, closes
  // both.
  const hydrated = useHydrated()
  const [opened, setOpened] = useState(false)
  const [autoClosed, setAutoClosed] = useState(false)
  const confirming = opened || (!!autoOpen && hydrated && !autoClosed)
  const setConfirming = (open: boolean) => {
    setOpened(open)
    if (!open) setAutoClosed(true)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const descId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resultRef = useRef<HTMLParagraphElement>(null)
  // Focus moves onto the acknowledgement only when it replaces something the visitor was using
  // (#558 a11y review): a decline confirmed here, or the dialog (e.g. the ?decline=1 one) still open
  // when the member-invite GET answers "already declined", whose unmount must not leave focus on
  // <body>. That GET answering on a plain page load (the page is server-rendered with the button,
  // #773) swaps the button for the acknowledgement without taking focus.
  const wasDeclined = useRef(declined)

  useLayoutEffect(() => {
    if (declined && !wasDeclined.current && (confirmedHere || confirming)) resultRef.current?.focus()
    wasDeclined.current = declined
  }, [declined, confirmedHere, confirming])

  async function confirmDecline() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/member-invite/${token}/decline?slug=${encodeURIComponent(eventSlug)}`, { method: "POST" })
      if (!res.ok) throw new Error()
      setConfirming(false)
      setConfirmedHere(true)
    } catch {
      setError("La confirmation n'a pas pu être envoyée. Réessaie.")
    } finally {
      setBusy(false)
    }
  }

  if (declined) {
    return (
      <p ref={resultRef} tabIndex={-1} role="status" className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 focus:outline-none">
        Tu as indiqué ne pas être disponible pour cet événement. Tu peux changer d&apos;avis et t&apos;inscrire à tout moment depuis ce lien.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-700">Tu ne peux pas participer cette fois ?</p>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 text-sm font-medium text-gray-700 border border-gray-300 rounded-xl px-3 py-1.5 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Je ne suis pas disponible pour cet événement
      </button>

      {confirming && (
        <ModalShell
          role="alertdialog"
          title="Confirmer que tu n'es pas disponible ?"
          describedBy={descId}
          initialFocusRef={cancelRef}
          fallbackFocusOnClose={fallbackFocusOnClose}
          closeOnBackdrop={false}
          onClose={() => { if (!busy) setConfirming(false) }}
          panelClassName="max-w-sm"
        >
          <p id={descId} className="text-sm text-gray-700">
            L&apos;organisation ne te relancera plus pour cet événement. Tu pourras toujours t&apos;inscrire plus tard depuis ce même lien.
          </p>
          <p role="alert" className={error ? "mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}>
            {error ?? ""}
          </p>
          <div className="flex flex-wrap gap-3 pt-4">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => { if (!busy) setConfirming(false) }}
              aria-disabled={busy || undefined}
              className="flex-1 min-h-11 border border-gray-300 text-gray-800 rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Non, annuler
            </button>
            <button
              type="button"
              onClick={() => { if (!busy) void confirmDecline() }}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              className="flex-1 min-h-11 bg-gray-800 text-white border border-transparent rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-900 aria-disabled:opacity-50 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-800"
            >
              Confirmer
            </button>
          </div>
          {busy && <p className="mt-2 text-xs text-gray-700">Envoi en cours…</p>}
        </ModalShell>
      )}
    </div>
  )
}
