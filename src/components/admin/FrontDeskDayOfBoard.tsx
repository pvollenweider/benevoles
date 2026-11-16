// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
"use client"

import { useEffect, useRef, useState } from "react"
import DayOfBoard from "./DayOfBoard"
import { ACCESS_ENDED_TEXT } from "@/lib/day-of-sync"

type Props = Omit<React.ComponentProps<typeof DayOfBoard>, "frontDesk" | "onAccessEnded" | "registrationWindow">

/**
 * The « Jour J » board of a front-desk account (#1142). When its access to the event ends while
 * the page is open — a 403 on a poll or on an attendance action — the board is unmounted: its
 * timers, its live region and its « Mis à jour à … » line go with it. The end-of-access sentence
 * is focused, so it is said once, and nothing polls again. A 401 keeps its meaning: the session
 * expired, and the board stays as before.
 */
export default function FrontDeskDayOfBoard(props: Props) {
  const [ended, setEnded] = useState(false)
  const messageRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (ended) messageRef.current?.focus()
  }, [ended])

  if (ended) {
    return (
      <div className="space-y-4">
        <h2 ref={messageRef} tabIndex={-1} className="text-lg font-semibold text-gray-900 focus:outline-none">
          {ACCESS_ENDED_TEXT}
        </h2>
      </div>
    )
  }

  return <DayOfBoard {...props} frontDesk onAccessEnded={() => setEnded(true)} />
}
