"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import ModalShell from "@/components/admin/ModalShell"
import type { ActionRecap } from "@/lib/action-recap"

type Challenge = { label: string; expected: string }
type Props = {
  recap: ActionRecap
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Failure of the last attempt: shown in the dialog, which stays open. */
  error?: string | null
  /** Text the person must type before an irreversible action goes through (e.g. the slug). */
  challenge?: Challenge
  /** Extra fields under the recap (e.g. an optional message), inside the same form. */
  children?: ReactNode
}

/**
 * Confirmation of a sensitive action (#379): the recap of what is about to happen (people,
 * emails, consequences, logging), Cancel focused first, Confirm styled by the stakes.
 */
export default function ConfirmActionModal({ recap, busy, onConfirm, onCancel, error, challenge, children }: Props) {
  const id = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const challengeRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState("")
  const [challengeError, setChallengeError] = useState<string | null>(null)
  const shown = challengeError ?? error ?? null

  function confirm() {
    if (busy) return
    if (challenge && typed.trim() !== challenge.expected) {
      // Cleared then set so the same sentence is voiced again; committed before the focus moves.
      flushSync(() => setChallengeError(null))
      flushSync(() => setChallengeError(`Le texte saisi ne correspond pas à « ${challenge.expected} ». Rien n'a été fait.`))
      challengeRef.current?.focus()
      return
    }
    setChallengeError(null)
    onConfirm()
  }
  return (
    <ModalShell
      title={recap.title}
      busy={busy}
      onClose={() => { if (!busy) onCancel() }}
      initialFocusRef={cancelRef}
      // The error paragraph is always part of the dialog's description, not only once shown: a
      // screen reader then reads it on reopening a dialog that failed before (the failure's own
      // announcement, role="alert" on that paragraph, only fires on change — this covers the case
      // where it was already there when the dialog (re)opens, e.g. a retry attempt's own failure).
      // A recap with a lead sentence or a warning (#516) is described by those only, the rest is
      // read in the dialog's own order; a short recap by its list. Never by the challenge's label:
      // the field's own label already says it.
      describedBy={(recap.lead || recap.warning
        ? [recap.lead ? `${id}-lead` : null, recap.warning ? `${id}-warning` : null, `${id}-error`]
        : [recap.lines.length > 0 ? `${id}-recap` : null, `${id}-error`]
      ).filter(Boolean).join(" ")}
      closeOnBackdrop={false}
      role={recap.danger ? "alertdialog" : "dialog"}
    >
      {/* A form so that Enter in the challenge field confirms; Cancel stays a plain button. */}
      <form onSubmit={(e) => { e.preventDefault(); confirm() }} noValidate>
      {recap.lead && <p id={`${id}-lead`} className="text-sm font-medium text-gray-900">{recap.lead}</p>}
      {recap.warning && (
        <p id={`${id}-warning`} className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 forced-colors:border-[CanvasText]">
          <strong className="font-semibold">Attention :</strong> {recap.warning}
        </p>
      )}
      {recap.groups?.map((g) => (
        <div key={g.heading} className="mt-3">
          <p className="text-sm font-semibold text-gray-900">{g.heading}</p>
          <ul className="mt-1 list-disc pl-5 space-y-1 text-sm text-gray-800">
            {g.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ))}
      {recap.lines.length > 0 && (
        <ul id={`${id}-recap`} className={`list-disc pl-5 space-y-1 text-sm text-gray-800${recap.lead || recap.warning || recap.groups ? " mt-3" : ""}`}>
          {recap.lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      {children}
      {challenge && (
        <div className="mt-4">
          <label id={`${id}-challenge-label`} htmlFor={`${id}-challenge`} className="block text-sm text-gray-800 mb-1">{challenge.label}</label>
          <input
            ref={challengeRef}
            id={`${id}-challenge`}
            type="text"
            value={typed}
            onChange={(e) => { setTyped(e.target.value); setChallengeError(null) }}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={challengeError ? true : undefined}
            aria-describedby={`${id}-error`}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          />
        </div>
      )}
      {/* Always mounted so that the failure is voiced when it appears. */}
      <p id={`${id}-error`} role="alert" className={shown ? "mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2" : "sr-only"}>{shown ?? ""}</p>
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
          type="submit"
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
      </form>
    </ModalShell>
  )
}
