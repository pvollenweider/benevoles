/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { UNDO_MS, useDelayedAction } from "../use-delayed-action"

// The undo window of a delayed action (#379).
describe("useDelayedAction", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it("runs the action once the window has passed, counting down for the UI", () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDelayedAction())
    expect(result.current.secondsLeft).toBeNull()
    act(() => result.current.start(run, { delayMs: 3000 }))
    expect(result.current.secondsLeft).toBe(3)
    act(() => { vi.advanceTimersByTime(1100) })
    expect(result.current.secondsLeft).toBe(2)
    expect(run).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.secondsLeft).toBeNull()
  })

  it("cancel drops the action for good", () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDelayedAction())
    act(() => result.current.start(run, { delayMs: 3000 }))
    let had = false
    act(() => { had = result.current.cancel() })
    expect(had).toBe(true)
    act(() => { vi.advanceTimersByTime(UNDO_MS) })
    expect(run).not.toHaveBeenCalled()
    expect(result.current.cancel()).toBe(false)
  })

  it("flush, pagehide and unmount run the action right away, once", () => {
    const run = vi.fn()
    const { result, unmount } = renderHook(() => useDelayedAction())
    act(() => result.current.start(run, { delayMs: 3000 }))
    act(() => { window.dispatchEvent(new Event("pagehide")) })
    expect(run).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(UNDO_MS) })
    expect(run).toHaveBeenCalledTimes(1)

    const second = vi.fn()
    act(() => result.current.start(second, { delayMs: 3000 }))
    unmount()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it("starting a new action commits the previous one first, unless it replaces it", () => {
    const first = vi.fn()
    const second = vi.fn()
    const third = vi.fn()
    const { result } = renderHook(() => useDelayedAction())
    act(() => result.current.start(first, { delayMs: 3000 }))
    act(() => result.current.start(second, { delayMs: 3000 }))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    act(() => result.current.start(third, { delayMs: 3000, replace: true }))
    act(() => { vi.advanceTimersByTime(3100) })
    expect(second).not.toHaveBeenCalled()
    expect(third).toHaveBeenCalledTimes(1)
  })

  it("pause holds the countdown where it is; resume restarts from there", () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDelayedAction())
    act(() => result.current.start(run, { delayMs: 4000 }))
    act(() => { vi.advanceTimersByTime(1000) })
    act(() => result.current.pause())
    expect(result.current.secondsLeft).toBe(3)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(run).not.toHaveBeenCalled()
    expect(result.current.secondsLeft).toBe(3)
    act(() => result.current.resume())
    act(() => { vi.advanceTimersByTime(2900) })
    expect(run).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(200) })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("never shows 0 seconds", () => {
    const { result } = renderHook(() => useDelayedAction())
    act(() => result.current.start(() => {}, { delayMs: 1000 }))
    act(() => { vi.advanceTimersByTime(900) })
    expect(result.current.secondsLeft).toBe(1)
  })
})
