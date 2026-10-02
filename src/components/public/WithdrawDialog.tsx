"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef } from "react"
import ModalShell from "@/components/admin/ModalShell"
import type { WithdrawCopy } from "@/lib/volunteer-withdraw"

type Props = {
  /** The words for the registration's status, from `withdrawCopy(status, label)`. */
  copy: WithdrawCopy
  /** The shift's name, in bold in the description. */
  label: string
  /** The withdrawal request is running: the dialog stays, its buttons do nothing. */
  busy: boolean
  /** Why the last attempt failed (nothing was withdrawn), or null. */
  error: string | null
  onConfirm: () => void
  /** « Non, garder », Escape or « Fermer »: closes without withdrawing. */
  onKeep: () => void
  /** The confirm button: the page keeps focus there after a failure. */
  confirmRef?: React.Ref<HTMLButtonElement>
}

/**
 * Confirmation before withdrawing a held shift from the public event page (#584): an alertdialog
 * on ModalShell (focus trap, Escape, scroll lock), focus first on « Non, garder ». The request runs
 * with the dialog open; a failure is said in it, and focus stays on the confirm button.
 *
 * Not ConfirmActionModal: it voices « Action en cours… » (a second announcement for one action,
 * the page announces the result) and its « Annuler » would be ambiguous next to a cancellation.
 */
export default function WithdrawDialog({ copy, label, busy, error, onConfirm, onKeep, confirmRef }: Props) {
  const descId = useId()
  const keepRef = useRef<HTMLButtonElement>(null)

  return (
    <ModalShell
      role="alertdialog"
      title={copy.confirmTitle}
      describedBy={descId}
      initialFocusRef={keepRef}
      closeOnBackdrop={false}
      onClose={() => { if (!busy) onKeep() }}
      panelClassName="max-w-sm"
    >
      <p id={descId} className="text-sm text-gray-700">
        {copy.confirmBefore}<strong className="font-semibold text-gray-900">{label}</strong>{copy.confirmAfter}
      </p>
      {/* Always mounted, so that its text is voiced when it arrives. */}
      <p role="alert" className={error ? "mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}>
        {error ?? ""}
      </p>
      <div className="flex flex-wrap gap-3 pt-4">
        <button
          ref={keepRef}
          type="button"
          onClick={() => { if (!busy) onKeep() }}
          aria-disabled={busy || undefined}
          className="flex-1 min-h-11 border border-gray-300 text-gray-800 rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-50 aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Non, garder
        </button>
        <button
          ref={confirmRef}
          type="button"
          onClick={() => { if (!busy) onConfirm() }}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className="flex-1 min-h-11 bg-red-700 text-white border border-transparent rounded-xl px-4 py-2 text-sm font-semibold hover:bg-red-800 aria-disabled:opacity-50 aria-disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          {copy.confirmButton}
        </button>
      </div>
      {/* Visible only: opacity alone must not carry the busy state (DESIGN.md), and the result is
          announced once by the page, so this is not a live region. */}
      {busy && <p className="mt-2 text-xs text-gray-700">Envoi en cours…</p>}
    </ModalShell>
  )
}
