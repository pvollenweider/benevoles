"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"

export type InviteTarget = { id: string; title: string; dateLabel: string }

const BUTTON = "inline-flex items-center gap-1 text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const ITEM = "flex w-full min-h-11 flex-col justify-center rounded-lg px-3 py-1 text-left text-sm text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"

const invitationsHref = (eventId: string) => `/admin/events/${eventId}/invitations`

/**
 * « Inviter à un événement » on the members page (#1098): straight to an event's invitations
 * instead of Événements, the event, Inscriptions, then Invitations. One upcoming published event:
 * a plain link to it. Several: a disclosure (button + list of links, not an ARIA menu, as the
 * event header's « ⋯ ») that Escape, a tap outside or the focus leaving it closes. None: nothing.
 */
export default function InviteToEventMenu({ events }: { events: InviteTarget[] }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerOutside(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerOutside)
    return () => document.removeEventListener("pointerdown", onPointerOutside)
  }, [open])

  if (events.length === 0) return null
  if (events.length === 1) {
    return (
      <Link href={invitationsHref(events[0].id)} className={BUTTON}>
        Inviter à « {events[0].title} »
      </Link>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return
        e.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }}
      onBlur={(e) => {
        // Focus moved outside (Tab past the last link). A blur without a new target is not that:
        // iOS Safari does not focus a tapped button.
        const next = e.relatedTarget as Node | null
        if (open && next && !e.currentTarget.contains(next)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={BUTTON}
      >
        Inviter à un événement
        <span aria-hidden="true" className="text-xs text-gray-600">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div id={panelId} className="absolute left-0 sm:left-auto sm:right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {/* role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets. */}
          <ul role="list" className="space-y-0.5">
            {events.map((ev) => (
              <li key={ev.id}>
                <Link href={invitationsHref(ev.id)} className={ITEM}>
                  <span className="font-medium text-gray-900">{ev.title}</span>
                  <span className="sr-only">, </span>
                  <span className="text-xs text-gray-600">{ev.dateLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
