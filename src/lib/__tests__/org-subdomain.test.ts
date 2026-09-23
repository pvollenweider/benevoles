import { describe, it, expect } from "vitest"
import { orgSlugFromHost, NON_ORG_SUBDOMAINS } from "../org-subdomain"

describe("orgSlugFromHost", () => {
  it("extracts the org slug from a 3-part subdomain host", () => {
    expect(orgSlugFromHost("lausanne-rocks.benevol.app")).toBe("lausanne-rocks")
  })

  it("keeps the port out of the parsed hostname", () => {
    expect(orgSlugFromHost("lausanne-rocks.benevol.app:3000")).toBe("lausanne-rocks")
  })

  it("returns null for a system subdomain", () => {
    for (const sub of NON_ORG_SUBDOMAINS) {
      expect(orgSlugFromHost(`${sub}.benevol.app`)).toBeNull()
    }
  })

  it("returns null for the apex domain (no subdomain)", () => {
    expect(orgSlugFromHost("benevol.app")).toBeNull()
  })

  it("returns null for localhost", () => {
    expect(orgSlugFromHost("localhost")).toBeNull()
  })
})
