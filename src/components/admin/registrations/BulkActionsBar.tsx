"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

type Props = {
  /** Rows selected, hidden ones included. */
  selectedCount: number
  /** Selected confirmed people not marked present yet. */
  toCheckInCount: number
  /** Selected confirmed people already marked present. */
  toUndoCount: number
  /** Selected confirmed people, the ones a removal applies to. */
  activeCount: number
  /** No selected row has an email: nobody can be made a leader. */
  noneWithEmail: boolean
  /** No selected confirmed row has an email: no link to resend. */
  noActiveWithEmail: boolean
  /** A bulk request is running. */
  busy: boolean
  onPresence: (present: boolean) => void
  onMakeResponsible: () => void
  onResendLink: () => void
  onCancelRegistrations: () => void
  onClearSelection: () => void
}

// ── Toolbar of the actions on the current selection ─────────────────────────
export default function BulkActionsBar({
  selectedCount, toCheckInCount, toUndoCount, activeCount, noneWithEmail, noActiveWithEmail, busy,
  onPresence, onMakeResponsible, onResendLink, onCancelRegistrations, onClearSelection,
}: Props) {
  // Inert buttons stay focusable (aria-disabled, not disabled): a request starting under the
  // focus does not drop it to the page.
  const noUndo = busy
  const noLeader = busy || noneWithEmail
  const noResend = busy || noActiveWithEmail
  const noCancel = busy || activeCount === 0
  return (
    <div role="group" aria-label="Actions sur la sélection" className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex-wrap">
      <span className="text-sm text-blue-900 font-medium">
        {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
      </span>
      <button
        type="button"
        onClick={() => { if (!busy && toCheckInCount > 0) onPresence(true) }}
        aria-disabled={busy || toCheckInCount === 0}
        className={`text-xs text-green-800 border border-green-300 bg-white px-3 py-1.5 rounded-full hover:bg-green-50 transition-colors ${busy || toCheckInCount === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {`Marquer présent${toCheckInCount > 1 ? "s" : ""} (${toCheckInCount})`}
      </button>
      {toUndoCount > 0 && (
        <button
          type="button"
          onClick={() => { if (!noUndo) onPresence(false) }}
          aria-disabled={noUndo}
          className={`text-xs text-gray-700 border border-gray-300 bg-white px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors ${noUndo ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {`Annuler la présence (${toUndoCount})`}
        </button>
      )}
      <button
        type="button"
        onClick={() => { if (!noLeader) onMakeResponsible() }}
        aria-disabled={noLeader}
        className={`text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors ${noLeader ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        Rendre responsable
      </button>
      <button
        type="button"
        onClick={() => { if (!noResend) onResendLink() }}
        aria-disabled={noResend}
        className={`text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors ${noResend ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        Renvoyer le lien
      </button>
      <button
        type="button"
        onClick={() => { if (!noCancel) onCancelRegistrations() }}
        aria-disabled={noCancel}
        className={`text-xs text-red-600 border border-red-300 bg-white px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors ${noCancel ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {`Retirer de leur créneau (${activeCount})`}
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        className="text-xs text-blue-600 hover:text-blue-800 ml-auto"
      >
        Désélectionner
      </button>
    </div>
  )
}
