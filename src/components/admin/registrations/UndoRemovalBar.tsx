"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, type RefObject } from "react"

export type HoldReason = "focus" | "pointer"

type Props = {
  /** How many removals are waiting for the end of the window. */
  count: number
  secondsLeft: number
  /** « Annuler le retrait »: the parent moves the focus there when a removal starts. */
  undoButtonRef: RefObject<HTMLButtonElement | null>
  onUndo: () => void
  onRemoveNow: () => void
  /** The focus or the pointer is on the bar: the countdown waits (WCAG 2.2.1). */
  onHold: (reason: HoldReason) => void
  onRelease: (reason: HoldReason) => void
}

// ── Undo window of a bulk removal (#379) ────────────────────────────────────
export default function UndoRemovalBar({ count, secondsLeft, undoButtonRef, onUndo, onRemoveNow, onHold, onRelease }: Props) {
  const undoBarRef = useRef<HTMLDivElement>(null)
  const undoTextId = useId()
  return (
    <div
      ref={undoBarRef}
      onFocus={() => onHold("focus")}
      onBlur={(e) => { if (!undoBarRef.current?.contains(e.relatedTarget as Node | null)) onRelease("focus") }}
      onPointerEnter={() => onHold("pointer")}
      onPointerLeave={() => onRelease("pointer")}
      className="text-sm text-gray-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <span id={undoTextId}>
        {count} {count > 1 ? "bénévoles seront retirés" : "bénévole sera retiré"} de {count > 1 ? "leur" : "son"} créneau
        {" "}<span role="timer">dans {secondsLeft} s</span>. Le compte à rebours attend tant que vous êtes sur cette barre.
      </span>
      <button
        ref={undoButtonRef}
        type="button"
        onClick={onUndo}
        aria-describedby={undoTextId}
        className="font-medium text-blue-800 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Annuler le retrait
      </button>
      <button
        type="button"
        onClick={onRemoveNow}
        aria-describedby={undoTextId}
        className="text-gray-700 underline underline-offset-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Retirer maintenant
      </button>
    </div>
  )
}
