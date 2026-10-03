"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef } from "react"
import { canTakeFocus, focusFirstAvailable, isFocusDropped } from "@/lib/focus-return"
import { tabbables, trapTarget } from "@/lib/focus-trap"
import { resolveOpener, trackPointerOpener } from "@/lib/modal-opener"

/** Open dialogs, innermost last: only the topmost one traps Tab and handles Escape. */
const openDialogs: HTMLElement[] = []

type Props = {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Tailwind classes for the dialog panel (width, height, layout). */
  panelClassName?: string
  /** Element focused on open. Defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** Set to false to ignore clicks on the backdrop (long forms, dirty state). */
  closeOnBackdrop?: boolean
  /** Id of an element inside the dialog that describes it (aria-describedby). */
  describedBy?: string
  /** "alertdialog" for a confirmation that interrupts the task (its description is read on open). */
  role?: "dialog" | "alertdialog"
  /**
   * A request runs: « Fermer », Escape and the backdrop do nothing. « Fermer » stays focusable
   * (`aria-disabled`), so focus is not lost while it waits.
   */
  busy?: boolean
}

// Installed when the module loads, before any tap that opens a dialog: under WebKit the opener is
// the last control pressed with a pointer (see modal-opener.ts).
trackPointerOpener()

/**
 * Accessible modal dialog: role="dialog" + aria-modal, labelled by its title,
 * Escape to close, focus trap, focus moved in on open and restored to the
 * opener on close, body scroll locked while open.
 * Nested modals are not supported.
 *
 * Focus (#585): the trap skips hidden, inert and disabled elements and brings focus back in when it
 * is outside the dialog. The opener is the focused element, or the control last pressed with a
 * pointer when WebKit left focus on `<body>` or `<main>`. On close, focus goes back to the opener
 * only if nobody else moved it: a parent that focuses something when the dialog closes wins.
 */
export default function ModalShell({
  title,
  onClose,
  children,
  panelClassName = "max-w-lg",
  initialFocusRef,
  role = "dialog",
  closeOnBackdrop = true,
  describedBy,
  busy = false,
}: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  })

  const requestClose = () => { if (!busy) onClose() }

  // Return focus to the opener on close, and lock body scroll while open.
  // Declared before the focus effect below: effects run in order, so the opener is read before
  // focus moves into the dialog.
  useEffect(() => {
    const opener = resolveOpener(document.activeElement)
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
      // Only if focus was dropped (the dialog is gone, or WebKit left it on <main>): a parent that
      // moved it on close in a layout effect, or with flushSync then focus, has already run and
      // wins (a passive effect or next-frame focus would run after this, with a brief flash). The
      // dialog.contains clause only matters for StrictMode's simulated unmount in dev. A removed
      // or hidden opener is skipped; the parent owns any fallback.
      const active = document.activeElement
      if (opener && (isFocusDropped(active) || !!dialog?.contains(active))) focusFirstAvailable([opener])
    }
  }, [])

  // Focus trap and Escape. Runs once: onClose is read through a ref so an
  // inline callback in the parent does not re-run this effect on every render.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    const preferred = initialFocusRef?.current
    const target = canTakeFocus(preferred) ? preferred : tabbables(el)[0]
    target?.focus()

    openDialogs.push(el)

    function onKeyDown(e: KeyboardEvent) {
      // Only the topmost dialog handles keys: two open dialogs would otherwise fight over focus
      // and one Escape would close both.
      if (openDialogs[openDialogs.length - 1] !== el) return
      if (e.key === "Escape") {
        if (!busyRef.current) onCloseRef.current()
        return
      }
      if (e.key !== "Tab" || !el) return

      // Wrap at either end, and bring back in a focus left outside the dialog (WebKit tap, a click
      // on the dialog's text). With nothing to reach, Tab does nothing.
      const items = tabbables(el)
      const next = trapTarget(el, items, document.activeElement, e.shiftKey)
      if (next || items.length === 0) e.preventDefault()
      next?.focus()
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      const i = openDialogs.lastIndexOf(el)
      if (i !== -1) openDialogs.splice(i, 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={closeOnBackdrop ? requestClose : undefined}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        className={`bg-white rounded-2xl p-5 w-full max-h-[85dvh] overflow-y-auto overscroll-contain ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fermer"
            aria-disabled={busy || undefined}
            className="min-h-11 min-w-11 -mr-2 inline-flex items-center justify-center rounded-full text-gray-600 hover:text-gray-900 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed text-xl leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
