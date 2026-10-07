import { describe, it, expect } from "vitest"
import { apexRedirectUrl } from "../apex-redirect"

const SITE = "https://www.benevol.app"

describe("apexRedirectUrl (#759)", () => {
  it("sends the bare domain to the www site, keeping the path and the query", () => {
    expect(apexRedirectUrl("benevol.app", "/", SITE)).toBe("https://www.benevol.app/")
    expect(apexRedirectUrl("benevol.app", "/fonctionnalites", SITE)).toBe("https://www.benevol.app/fonctionnalites")
    expect(apexRedirectUrl("benevol.app:443", "/doc/admin?x=1#top", SITE)).toBe("https://www.benevol.app/doc/admin?x=1#top")
    expect(apexRedirectUrl("Benevol.App", "/admin/login?callbackUrl=%2Fadmin", SITE)).toBe("https://www.benevol.app/admin/login?callbackUrl=%2Fadmin")
  })

  it("leaves every other host alone", () => {
    for (const host of ["www.benevol.app", "fete-du-village.benevol.app", "medias.benevol.app", "localhost:3000", "evil-benevol.app", "benevol.app.evil.com"]) {
      expect(apexRedirectUrl(host, "/", SITE), host).toBeNull()
    }
  })

  it("does nothing when the site address has no www (development, a self-hosted instance)", () => {
    expect(apexRedirectUrl("localhost", "/", "http://localhost:3000")).toBeNull()
    expect(apexRedirectUrl("benevoles.example.org", "/", "https://benevoles.example.org")).toBeNull()
    expect(apexRedirectUrl("benevol.app", "/", "not a url")).toBeNull()
  })
})
