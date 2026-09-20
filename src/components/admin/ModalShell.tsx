"use client"

import { useEffect, useId, useRef } from "react"

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
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal dialog: role="dialog" + aria-modal, labelled by its title,
 * Escape to close, focus trap, focus moved in on open and restored to the
 * opener on close, body scroll locked while open.
 * Nested modals are not supported.
 */
export default function ModalShell({
  title,
  onClose,
  children,
  panelClassName = "max-w-lg",
  initialFocusRef,
  closeOnBackdrop = true,
  describedBy,
}: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Return focus to the opener on close, and lock body scroll while open.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  // Focus trap and Escape. Runs once: onClose is read through a ref so an
  // inline callback in the parent does not re-run this effect on every render.
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    const getFocusable = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]

    const target = initialFocusRef?.current ?? getFocusable()[0]
    target?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current()
        return
      }
      if (e.key !== "Tab") return

      const els = getFocusable()
      if (!els.length) return
      const first = els[0]
      const last = els[els.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
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
            onClick={onClose}
            aria-label="Fermer"
            className="min-h-11 min-w-11 -mr-2 inline-flex items-center justify-center rounded-full text-gray-600 hover:text-gray-900 text-xl leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
