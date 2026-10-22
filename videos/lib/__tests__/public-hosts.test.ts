// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from "vitest"
import { hostResolverRules, localGatewayTarget, localTarget, servedWithPublicUrl, videoAdminEmail, VIDEO_ADMIN_EMAIL } from "../public-hosts"

describe("public hosts of the videos", () => {
  it("maps benevol.app and its subdomains, patterns without a port", () => {
    expect(hostResolverRules(44102)).toBe("--host-resolver-rules=MAP *.benevol.app 127.0.0.1:44102,MAP benevol.app 127.0.0.1:44102")
    expect(hostResolverRules(44102)).not.toMatch(/benevol\.app:\d/)
  })

  it("refuses an invalid proxy port", () => {
    expect(() => hostResolverRules(0)).toThrow()
    expect(() => hostResolverRules(70000)).toThrow()
  })

  it("forwards only to a local http server", () => {
    expect(localTarget("http://localhost:43102").port).toBe("43102")
    expect(localTarget("http://127.0.0.1:43100").hostname).toBe("127.0.0.1")
    expect(() => localTarget("https://www.benevol.app")).toThrow()
    expect(() => localTarget("http://benevol.app")).toThrow()
  })

  it("restricts HTTP forwarding to the app and Mailpit origins", () => {
    for (const host of ["localhost", "127.0.0.1"]) {
      for (const port of [43104, 48026]) {
        expect(localGatewayTarget(`http://${host}:${port}//example.org/path?q=1`, "http://localhost:43104")?.href)
          .toBe(`http://127.0.0.1:${port}//example.org/path?q=1`)
      }
    }
    for (const url of ["http://localhost:22/", "http://127.0.0.1:43102/", "http://localhost/", "https://localhost:43104/", "http://example.org:43104/", "http://localhost.example.org:43104/", "http://user@localhost:43104/", "/relative", "invalid"]) {
      expect(localGatewayTarget(url, "http://localhost:43104")).toBeNull()
    }
  })

  it("uses only the explicitly configured loopback Mailpit port", () => {
    try {
      vi.stubEnv("VIDEO_MAILPIT_URL", "http://localhost:48030")
      expect(localGatewayTarget("http://localhost:48030/mail", "http://localhost:43102")?.href).toBe("http://127.0.0.1:48030/mail")
      expect(localGatewayTarget("http://localhost:48026/mail", "http://localhost:43102")).toBeNull()
      vi.stubEnv("VIDEO_MAILPIT_URL", "http://example.org:48030")
      expect(() => localGatewayTarget("http://localhost:48030/", "http://localhost:43102")).toThrow("Local Mailpit URL required")
    } finally { vi.unstubAllEnvs() }
  })

  it("replaces the legacy localhost admin email, keeps a dedicated one", () => {
    expect(videoAdminEmail(undefined)).toBe(VIDEO_ADMIN_EMAIL)
    expect(videoAdminEmail("org-admin@localhost")).toBe(VIDEO_ADMIN_EMAIL)
    expect(videoAdminEmail("video.search.owner@example.org")).toBe("video.search.owner@example.org")
  })

  it("recognizes a page served with the public address", () => {
    expect(servedWithPublicUrl('<link rel="canonical" href="https://www.benevol.app/doc"/>')).toBe(true)
    expect(servedWithPublicUrl('<link rel="canonical" href="http://localhost:43100/doc"/>')).toBe(false)
    expect(servedWithPublicUrl('<a href="https://www.benevol.app/doc">')).toBe(false)
  })
})
