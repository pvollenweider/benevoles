"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef } from "react"
import ModalShell from "@/components/admin/ModalShell"
import type { ActionRecap } from "@/lib/action-recap"

type Props = { recap: ActionRecap; busy: boolean; onConfirm: () => void; onCancel: () => void; /** Failure of the last attempt: shown in the dialog, which stays open. */ error?: string | null }

/**
 * Confirmation of a sensitive action (#379): the recap of what is about to happen (people,
 * emails, consequences, logging), Cancel focused first, Confirm styled by the stakes.
 */
export default function ConfirmActionModal({ recap, busy, onConfirm, onCancel, error }: Props) {
  const id = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <ModalShell title={recap.title} onClose={() => { if (!busy) onCancel() }} initialFocusRef={cancelRef} describedBy={`${id}-recap`} closeOnBackdrop={false} role={recap.danger ? "alertdialog" : "dialog"}>
      <ul id={`${id}-recap`} className="list-disc pl-5 space-y-1 text-sm text-gray-800">
        {recap.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      {/* Always mounted so that the failure is voiced when it appears. */}
      <p role="alert" className={error ? "mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}>{error ?? ""}</p>
      <div className="flex flex-wrap justify-end gap-3 pt-4">
        <button
          ref={cancelRef}
          type="button"
          onClick={() => { if (!busy) onCancel() }}
          aria-disabled={busy || undefined}
          className="text-sm font-medium border border-gray-300 text-gray-800 rounded-xl px-4 py-2 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => { if (!busy) onConfirm() }}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          className={`text-sm font-semibold text-white rounded-xl px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            recap.danger ? "bg-red-600 hover:bg-red-700 focus-visible:outline-red-700" : "bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-600"
          } ${busy ? "cursor-wait" : ""}`}
        >
          {busy ? "En cours…" : error ? "Réessayer" : recap.confirmLabel}
        </button>
        {/* The label change of the focused button isn't reliably voiced: say it once, politely. */}
        <span role="status" className="sr-only">{busy ? "Action en cours…" : ""}</span>
      </div>
    </ModalShell>
  )
}
