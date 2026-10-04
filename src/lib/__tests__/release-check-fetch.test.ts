import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { fetchLatestRelease } from "../release-check-fetch"

describe("fetchLatestRelease", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it("returns the version and url on a normal release", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v2.1.0", html_url: "https://github.com/x/releases/tag/v2.1.0", draft: false, prerelease: false }),
    }) as unknown as typeof fetch

    expect(await fetchLatestRelease()).toEqual({ version: "v2.1.0", url: "https://github.com/x/releases/tag/v2.1.0" })
  })

  it("returns null on a prerelease", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v2.1.0-rc.1", html_url: "https://x", prerelease: true }),
    }) as unknown as typeof fetch

    expect(await fetchLatestRelease()).toBeNull()
  })

  it("returns null on a draft", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v2.1.0", html_url: "https://x", draft: true }),
    }) as unknown as typeof fetch

    expect(await fetchLatestRelease()).toBeNull()
  })

  it("returns null and warns, never throws, on a non-200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    await expect(fetchLatestRelease()).resolves.toBeNull()
  })

  it("returns null and warns, never throws, on a network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch
    await expect(fetchLatestRelease()).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalled()
  })

  it("returns null on a malformed body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch
    expect(await fetchLatestRelease()).toBeNull()
  })
})
