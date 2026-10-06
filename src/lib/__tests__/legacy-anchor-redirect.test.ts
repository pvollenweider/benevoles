import { describe, it, expect } from "vitest"
import { legacyAnchorRedirect } from "../legacy-anchor-redirect"

// #649: an old link into a guide (/doc/benevole#<anchor>) follows its section to its unit.
describe("legacyAnchorRedirect", () => {
  const targets = { revenir: "/doc/revenir-sur-la-page", modifier: "/doc/modifier#annuler" }
  const nothingOnPage = () => false

  it("sends a moved anchor to its unit, with or without the « # », its fragment kept", () => {
    expect(legacyAnchorRedirect("#revenir", targets, nothingOnPage)).toBe("/doc/revenir-sur-la-page")
    expect(legacyAnchorRedirect("modifier", targets, nothingOnPage)).toBe("/doc/modifier#annuler")
  })

  it("stays when the anchor is still on the page (the guide still shows it during the split)", () => {
    expect(legacyAnchorRedirect("#revenir", targets, (id) => id === "revenir")).toBeNull()
  })

  it("stays without a fragment, on an anchor no unit claims, or on a malformed fragment", () => {
    expect(legacyAnchorRedirect("", targets, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#", targets, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#inconnu", targets, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#%E0%A4%A", targets, nothingOnPage)).toBeNull()
  })

  it("decodes the fragment before looking it up", () => {
    expect(legacyAnchorRedirect("#revenir%20", { "revenir ": "/doc/a" }, nothingOnPage)).toBe("/doc/a")
  })

  it("never reads inherited properties, and only ever goes to a documentation unit", () => {
    expect(legacyAnchorRedirect("#constructor", targets, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#__proto__", targets, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#a", { a: "https://example.com/doc/x" }, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#a", { a: "//example.com" }, nothingOnPage)).toBeNull()
    expect(legacyAnchorRedirect("#a", { a: "/admin" }, nothingOnPage)).toBeNull()
  })
})
