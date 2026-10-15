import { describe, it, expect } from "vitest"
import { apexHomeHref, apexHref, apexLinkBase, belongsOnApex } from "../apex-links"

const WWW = "https://www.benevol.app"

describe("apexLinkBase", () => {
  it("is the origin of the site's address", () => {
    expect(apexLinkBase("https://www.benevol.app")).toBe(WWW)
    expect(apexLinkBase("https://www.benevol.app/")).toBe(WWW)
    expect(apexLinkBase("https://benevoles.asso.example")).toBe("https://benevoles.asso.example")
  })

  // Locally an organisation has no host of its own (`?org=`): relative links stay on the server in use.
  it("is null without an address, locally, or for an invalid one", () => {
    for (const url of [undefined, null, "", "http://localhost:3000", "http://localhost:3100", "http://app.localhost:3000", "http://127.0.0.1:3000", "nope"]) {
      expect(apexLinkBase(url), String(url)).toBeNull()
    }
  })
})

describe("belongsOnApex", () => {
  it("is every apex-only page and the administration", () => {
    for (const path of ["/doc", "/doc/benevole", "/legal/terms", "/legal/privacy#droits", "/legal/exploitant", "/accessibilite", "/videos", "/videos/ORG_FIRST_STEPS", "/fonctionnalites", "/blog", "/tarifs", "/admin/login", "/admin"]) {
      expect(belongsOnApex(path), path).toBe(true)
    }
  })

  it("is never an organisation's own page", () => {
    for (const path of ["/", "/fete-du-village", "/fete-du-village/infos", "/my/abc", "/leader/abc", "/waitlist/abc", "/documentation", "/administration", "/api/public/x"]) {
      expect(belongsOnApex(path), path).toBe(false)
    }
  })
})

describe("apexHref", () => {
  it("puts the site's pages on the site's address, query and fragment kept", () => {
    expect(apexHref("/doc/benevole", WWW)).toBe("https://www.benevol.app/doc/benevole")
    expect(apexHref("/legal/privacy#droits", WWW)).toBe("https://www.benevol.app/legal/privacy#droits")
    expect(apexHref("/admin/login", `${WWW}/`)).toBe("https://www.benevol.app/admin/login")
  })

  it("leaves the organisation's pages relative, on its host", () => {
    expect(apexHref("/fete-du-village", WWW)).toBe("/fete-du-village")
    expect(apexHref("/my/abc", WWW)).toBe("/my/abc")
    expect(apexHref("/leader/abc", WWW)).toBe("/leader/abc")
  })

  it("changes nothing without a base (localhost) nor for an absolute URL", () => {
    expect(apexHref("/doc/benevole", null)).toBe("/doc/benevole")
    expect(apexHref("https://github.com/pvollenweider/benevoles", WWW)).toBe("https://github.com/pvollenweider/benevoles")
    expect(apexHref("//evil.example/doc", WWW)).toBe("//evil.example/doc")
  })
})

describe("apexHomeHref", () => {
  it("is the site's home, or / locally", () => {
    expect(apexHomeHref(WWW)).toBe("https://www.benevol.app/")
    expect(apexHomeHref(null)).toBe("/")
  })
})
