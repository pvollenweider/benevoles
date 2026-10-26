"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState, type Ref } from "react"
import Link from "next/link"
import PublishToggle from "@/components/admin/PublishToggle"
import ArchiveButton from "@/components/admin/ArchiveButton"
import { DELETE_SECTION_ID, EVENT_MENU_PAGES, eventHref } from "@/lib/event-nav"

const ITEM_BASE = "flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
const ITEM = `${ITEM_BASE} text-gray-800 hover:bg-gray-50`

/**
 * « ⋯ »: the event's less frequent actions (Journal, Dupliquer, then Dépublier, Archiver and the
 * permanent deletion, at the bottom). A disclosure, not an ARIA menu: the panel holds inline
 * confirmations. It follows the button in the reading order; opening it leaves the focus on the
 * button (Tab goes in). Rendered only while open, so nothing hidden stays in the page. Escape, a tap outside, the focus leaving it or a new page close it. An
 * Escape a confirmation inside already handled (defaultPrevented) only cancels that confirmation.
 */
export default function EventMoreMenu({
  ref, eventId, publicStatus, canDelete, pathname, onDone,
}: {
  ref?: Ref<HTMLButtonElement>
  eventId: string
  publicStatus: string
  canDelete: boolean
  pathname: string
  onDone: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [openedOn, setOpenedOn] = useState(pathname)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()

  // A new page closes the panel (state adjusted during render, React's recommended pattern).
  if (open && openedOn !== pathname) setOpen(false)

  useEffect(() => {
    if (!open) return
    function onPointerOutside(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    // pointerdown covers mouse, touch and pen alike.
    document.addEventListener("pointerdown", onPointerOutside)
    return () => document.removeEventListener("pointerdown", onPointerOutside)
  }, [open])

  function finish(message: string) {
    setOpen(false)
    onDone(message)
  }

  const setButtonRef = (el: HTMLButtonElement | null) => {
    buttonRef.current = el
    if (typeof ref === "function") ref(el)
    else if (ref) ref.current = el
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open || e.defaultPrevented) return
        e.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }}
      onBlur={(e) => {
        // Focus moved outside (Tab past the last item). A blur without a new target is not that:
        // iOS Safari does not focus a tapped button (see UserMenu).
        const next = e.relatedTarget as Node | null
        if (open && next && !e.currentTarget.contains(next)) setOpen(false)
      }}
    >
      <button
        ref={setButtonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Autres actions"
        onClick={() => { setOpenedOn(pathname); setOpen((v) => !v) }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-lg leading-none text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
      <div
        id={panelId}
        className="absolute right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
      >
        <ul role="list" className="space-y-0.5">
          {EVENT_MENU_PAGES.map((p) => (
            <li key={p.path}>
              <Link href={eventHref(eventId, p.path)} className={ITEM} aria-current={pathname === eventHref(eventId, p.path) ? "page" : undefined}>
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
        <ul role="list" className="mt-1 space-y-0.5 border-t border-gray-200 pt-1">
            {/* Dépublier a published event; publish an archived one again (a draft has the header's « Publier »). */}
            {publicStatus !== "draft" && (
              <li><PublishToggle eventId={eventId} currentStatus={publicStatus} variant="menu" onDone={finish} /></li>
            )}
            {publicStatus !== "archived" && (
              <li><ArchiveButton eventId={eventId} currentStatus={publicStatus} onDone={finish} /></li>
            )}
            {canDelete && (
              <li>
                <Link
                  href={`${eventHref(eventId, "edit")}#${DELETE_SECTION_ID}`}
                  onClick={() => {
                    setOpen(false)
                    // Already on the Paramètres page: no new page, the heading takes the focus here.
                    requestAnimationFrame(() => document.getElementById(DELETE_SECTION_ID)?.focus())
                  }}
                  className={`${ITEM_BASE} text-red-700 hover:bg-red-50`}
                >
                  Supprimer définitivement…
                </Link>
              </li>
            )}
        </ul>
      </div>
      )}
    </div>
  )
}
