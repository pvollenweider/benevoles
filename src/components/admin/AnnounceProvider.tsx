"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { announce } from "@/lib/announce"

/** Says what an action did, then moves the focus (an element, or the id of one). */
export type AnnounceDone = (message: string, focus?: HTMLElement | string | null) => void

const AnnounceContext = createContext<AnnounceDone | null>(null)

const moveFocus = (focus?: HTMLElement | string | null) => {
  const el = typeof focus === "string" ? document.getElementById(focus) : focus
  el?.focus()
}

/**
 * One polite live region for the actions whose control disappears once done (#1098): archiving
 * from « Ce qui demande votre attention » removes the item, the event header's « ⋯ » actions
 * unmount with the panel. It stays mounted above them, so router.refresh() keeps it and the
 * message is still voiced. No role="status": the pages' own status regions stay the only ones
 * (several pages and their tests rely on a single status region).
 */
export default function AnnounceProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("")
  const done = useCallback<AnnounceDone>((message, focus) => {
    announce(setText, message)
    moveFocus(focus)
  }, [])
  return (
    <AnnounceContext value={done}>
      {children}
      <p aria-live="polite" aria-atomic="true" className="sr-only">{text}</p>
    </AnnounceContext>
  )
}

/** The provider's `done`; outside one (a component rendered alone), it only moves the focus. */
export function useAnnounceDone(): AnnounceDone {
  return useContext(AnnounceContext) ?? ((_message, focus) => moveFocus(focus))
}
