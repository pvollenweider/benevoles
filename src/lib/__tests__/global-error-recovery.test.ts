// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  AUTO_RELOAD_STORAGE_KEY,
  AUTO_RELOAD_WINDOW_MS,
  isNetworkFailure,
  shouldAutoReload,
  type RecoveryStorage,
} from "../global-error-recovery"

const NOW = 1_700_000_000_000

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage: RecoveryStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
  return { storage, data }
}

describe("isNetworkFailure", () => {
  it.each([
    ["Safari", "Load failed"],
    ["Chrome", "Failed to fetch"],
    ["Firefox", "NetworkError when attempting to fetch resource."],
    ["Firefox, without its final period", "NetworkError when attempting to fetch resource"],
  ])("recognizes the %s network failure", (_browser, message) => {
    expect(isNetworkFailure(new TypeError(message))).toBe(true)
  })

  it("rejects anything that is not exactly one of those TypeError messages", () => {
    expect(isNetworkFailure(new Error("Load failed"))).toBe(false)
    expect(isNetworkFailure(new TypeError("Load failed: /api/admin/events"))).toBe(false)
    expect(isNetworkFailure(new TypeError("Failed to fetch the event"))).toBe(false)
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined"))).toBe(false)
    expect(isNetworkFailure(new TypeError(""))).toBe(false)
    expect(isNetworkFailure("Load failed")).toBe(false)
    expect(isNetworkFailure({ name: "TypeError", message: "Load failed" })).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
    expect(isNetworkFailure(undefined)).toBe(false)
  })
})

describe("shouldAutoReload", () => {
  it("allows the first reload and records its moment", () => {
    const { storage, data } = memoryStorage()
    expect(shouldAutoReload(storage, NOW)).toBe(true)
    expect(data.get(AUTO_RELOAD_STORAGE_KEY)).toBe(String(NOW))
  })

  it("refuses a second reload inside the 30 s window, then allows one again at the boundary", () => {
    const { storage, data } = memoryStorage()
    expect(shouldAutoReload(storage, NOW)).toBe(true)
    // The refusal must not move the recorded moment, or the window would never end.
    expect(shouldAutoReload(storage, NOW + AUTO_RELOAD_WINDOW_MS - 1)).toBe(false)
    expect(data.get(AUTO_RELOAD_STORAGE_KEY)).toBe(String(NOW))
    expect(shouldAutoReload(storage, NOW + AUTO_RELOAD_WINDOW_MS)).toBe(true)
    expect(data.get(AUTO_RELOAD_STORAGE_KEY)).toBe(String(NOW + AUTO_RELOAD_WINDOW_MS))
  })

  it("honours a timestamp left by an earlier failure (another tab, same session)", () => {
    const { storage, data } = memoryStorage({ [AUTO_RELOAD_STORAGE_KEY]: String(NOW - 1_000) })
    expect(shouldAutoReload(storage, NOW)).toBe(false)
    expect(data.get(AUTO_RELOAD_STORAGE_KEY)).toBe(String(NOW - 1_000))
  })

  it("treats an unreadable or future timestamp as stale instead of blocking forever", () => {
    for (const value of ["", "not a number", String(NOW + 60_000)]) {
      const { storage } = memoryStorage({ [AUTO_RELOAD_STORAGE_KEY]: value })
      expect(shouldAutoReload(storage, NOW), value).toBe(true)
    }
  })

  it("never reloads when reading sessionStorage throws (private mode)", () => {
    let wrote = false
    const storage: RecoveryStorage = {
      getItem: () => {
        throw new Error("storage disabled")
      },
      setItem: () => {
        wrote = true
      },
    }
    expect(shouldAutoReload(storage, NOW)).toBe(false)
    expect(wrote).toBe(false)
  })

  it("never reloads when writing sessionStorage throws (quota, private mode)", () => {
    const storage: RecoveryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded")
      },
    }
    expect(shouldAutoReload(storage, NOW)).toBe(false)
  })
})
