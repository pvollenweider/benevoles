"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useRef, useState } from "react"

/** Undo window of a delayed action (#379). */
export const UNDO_MS = 10_000

type Scheduled = {
  run: () => void
  timer: ReturnType<typeof setTimeout> | null
  tick: ReturnType<typeof setInterval> | null
  dueAt: number
  /** Milliseconds left while paused; null while running. */
  remaining: number | null
}

/**
 * Runs an action after a delay during which it can be cancelled ("delay the commit", #379).
 * `secondsLeft` counts down for the UI; `pause()` holds the countdown (while the focus or the
 * pointer is on the undo control, so the time limit can be extended, WCAG 2.2.1); leaving the
 * page (pagehide) or unmounting the component runs the action at once so that a confirmed
 * action never gets lost.
 */
export function useDelayedAction() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const scheduled = useRef<Scheduled | null>(null)

  const stopTimers = (s: Scheduled) => {
    if (s.timer) clearTimeout(s.timer)
    if (s.tick) clearInterval(s.tick)
    s.timer = null
    s.tick = null
  }

  const clear = useCallback(() => {
    const s = scheduled.current
    if (!s) return null
    stopTimers(s)
    scheduled.current = null
    setSecondsLeft(null)
    return s
  }, [])

  const arm = useCallback((s: Scheduled, delayMs: number) => {
    s.dueAt = Date.now() + delayMs
    s.remaining = null
    s.timer = setTimeout(() => { clear(); s.run() }, delayMs)
    s.tick = setInterval(() => setSecondsLeft(Math.max(1, Math.ceil((s.dueAt - Date.now()) / 1000))), 250)
    setSecondsLeft(Math.max(1, Math.ceil(delayMs / 1000)))
  }, [clear])

  /** Runs the scheduled action now, if any. */
  const flush = useCallback(() => {
    const s = clear()
    if (s) s.run()
  }, [clear])

  /** Drops the scheduled action; returns true when there was one. */
  const cancel = useCallback(() => clear() !== null, [clear])

  /** Schedules `run`; a previous pending action is run first, unless `replace` drops it. */
  const start = useCallback((run: () => void, opts: { delayMs?: number; replace?: boolean } = {}) => {
    if (opts.replace) clear()
    else flush()
    const s: Scheduled = { run, timer: null, tick: null, dueAt: 0, remaining: null }
    scheduled.current = s
    arm(s, opts.delayMs ?? UNDO_MS)
  }, [arm, clear, flush])

  const pause = useCallback(() => {
    const s = scheduled.current
    if (!s || s.remaining !== null) return
    stopTimers(s)
    s.remaining = Math.max(0, s.dueAt - Date.now())
  }, [])

  const resume = useCallback(() => {
    const s = scheduled.current
    if (!s || s.remaining === null) return
    arm(s, s.remaining)
  }, [arm])

  useEffect(() => {
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [flush])

  return { secondsLeft, start, cancel, flush, pause, resume }
}
