import { describe, it, expect } from "vitest"
import { cleanPath } from "../clean-path"

// `//events` crashed the client router with a SecurityError (Sentry, 2026-09-30).
describe("cleanPath", () => {
  it("collapses repeated slashes anywhere in the path", () => {
    expect(cleanPath("//events")).toBe("/events")
    expect(cleanPath("///")).toBe("/")
    expect(cleanPath("/admin//events///abc/")).toBe("/admin/events/abc/")
  })

  it("leaves clean paths alone", () => {
    expect(cleanPath("/")).toBeNull()
    expect(cleanPath("/events")).toBeNull()
    expect(cleanPath("/admin/events/abc")).toBeNull()
  })

  it("gives a path the URL parser keeps on the same host", () => {
    const clean = cleanPath("//evil.example/x")!
    expect(new URL(clean, "https://www.benevol.app").host).toBe("www.benevol.app")
  })
})
