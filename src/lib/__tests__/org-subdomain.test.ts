import { describe, it, expect } from "vitest"
import { orgSlugFromHost, NON_ORG_SUBDOMAINS, withOrgHeader, isReservedOrgSlug } from "../org-subdomain"

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

// Regression (#541): without an org subdomain and without ?org=, the proxy kept an x-org-slug sent
// by the client, so a request could pick the organization public routes scope their data with.
describe("withOrgHeader", () => {
  const sent = (pairs: [string, string][]) => {
    const h = new Headers()
    for (const [k, v] of pairs) h.append(k, v)
    return h
  }

  it("drops a client-sent header when the host carries no organization", () => {
    const h = withOrgHeader(sent([["x-org-slug", "other-org"]]), "www.benevol.app", null)
    expect(h.get("x-org-slug")).toBeNull()
  })

  it.each([["X-Org-Slug"], ["X-ORG-SLUG"], ["x-org-slug"]])("drops it whatever its case (%s)", (name) => {
    const h = withOrgHeader(sent([[name, "other-org"]]), "localhost:3000", null)
    expect(h.get("x-org-slug")).toBeNull()
  })

  it("drops every value when the client repeats the header", () => {
    const h = withOrgHeader(sent([["x-org-slug", "a"], ["X-Org-Slug", "b"]]), "benevol.app", null)
    expect(h.get("x-org-slug")).toBeNull()
  })

  it("replaces a client value with the organization of the host", () => {
    const h = withOrgHeader(sent([["x-org-slug", "other-org"]]), "lausanne-rocks.benevol.app", null)
    expect(h.get("x-org-slug")).toBe("lausanne-rocks")
  })

  it("prefers the host over ?org=, and uses ?org= only without an org subdomain", () => {
    expect(withOrgHeader(new Headers(), "lausanne-rocks.benevol.app", "other").get("x-org-slug")).toBe("lausanne-rocks")
    expect(withOrgHeader(sent([["x-org-slug", "x"]]), "localhost:3000", "default").get("x-org-slug")).toBe("default")
    expect(withOrgHeader(new Headers(), "www.benevol.app", "").get("x-org-slug")).toBeNull()
  })

  it("keeps the other headers and leaves the original untouched", () => {
    const original = sent([["x-org-slug", "other-org"], ["accept-language", "fr"]])
    const h = withOrgHeader(original, "benevol.app", null)
    expect(h.get("accept-language")).toBe("fr")
    expect(original.get("x-org-slug")).toBe("other-org")
  })
})

describe("isReservedOrgSlug", () => {
  it("reserves the media host and the other technical subdomains, whatever the case", () => {
    expect(orgSlugFromHost("medias.benevol.app")).toBeNull()
    for (const slug of ["medias", "Medias", " www ", "api", "admin", "app", "staging"]) expect(isReservedOrgSlug(slug)).toBe(true)
  })

  it("catches variants: accents, hyphens, a plural or a missing plural (#642)", () => {
    for (const slug of ["media", "Médias", "w-w-w", "apis", "admins", "apps", "stagings", "me-dias"]) expect(isReservedOrgSlug(slug)).toBe(true)
  })

  it("leaves ordinary organization slugs alone, including ones that only contain a reserved word", () => {
    for (const slug of ["lameadouet", "medias-club", "festival-medias", "apiculteurs", "administration", "happy"]) expect(isReservedOrgSlug(slug)).toBe(false)
  })

  it("routing still uses the exact list: a variant is an ordinary subdomain there", () => {
    expect(orgSlugFromHost("media.benevol.app")).toBe("media")
  })
})
