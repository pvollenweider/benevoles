import { describe, it, expect, vi } from "vitest"
import { CLEAN_PATH_SCRIPT, cleanPath } from "../clean-path"

// `//events` crashed the client router with a SecurityError (Sentry, 2026-09-30, #474).
describe("cleanPath", () => {
  it("collapses repeated slashes anywhere in the path", () => {
    expect(cleanPath("//events")).toBe("/events")
    expect(cleanPath("///")).toBe("/")
    expect(cleanPath("/admin//events///abc/")).toBe("/admin/events/abc/")
  })

  it("leaves clean paths alone", () => {
    expect(cleanPath("/")).toBeNull()
    expect(cleanPath("/events")).toBeNull()
  })
})

describe("CLEAN_PATH_SCRIPT", () => {
  const run = (pathname: string, search = "", hash = "") => {
    const replace = vi.fn()
    const window = { location: { pathname, search, hash, replace } }
    new Function("window", CLEAN_PATH_SCRIPT)(window)
    return replace
  }

  it("replaces a doubled path with the clean one, same origin, query and hash kept", () => {
    expect(run("//events", "?x=1", "#top")).toHaveBeenCalledWith("/events?x=1#top")
    const target = run("//evil.example/x").mock.calls[0][0] as string
    // A path, never a protocol-relative URL: it stays on the same host.
    expect(target.startsWith("//")).toBe(false)
    expect(new URL(target, "https://www.benevol.app").host).toBe("www.benevol.app")
  })

  it("does nothing on a clean path", () => {
    expect(run("/doc/admin", "?q=1")).not.toHaveBeenCalled()
  })

  it("follows the same rule as cleanPath", () => {
    for (const p of ["//a", "/a//b", "/a/b", "///x///y//"]) {
      const replace = run(p)
      expect(replace.mock.calls[0]?.[0] ?? null).toBe(cleanPath(p))
    }
  })
})
