import { describe, it, expect } from "vitest"
import { contactEmail, localizeInstanceText, siteDomain, siteName, supportUrl } from "../site"

const upstream = { NEXT_PUBLIC_APP_URL: "https://www.benevol.app" }
const other = { NEXT_PUBLIC_APP_URL: "https://benevoles.example.org" }

describe("instance values (#760)", () => {
  it("names the instance by SITE_NAME, else its domain without www, else the upstream one", () => {
    expect(siteName(upstream)).toBe("benevol.app")
    expect(siteName(other)).toBe("benevoles.example.org")
    expect(siteName({ ...other, SITE_NAME: " Bénévoles du Jura " })).toBe("Bénévoles du Jura")
    expect(siteName({})).toBe("benevol.app")
    expect(siteDomain({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe("benevol.app")
  })

  it("gives the contact address: explicit, upstream, reply-to, or none", () => {
    expect(contactEmail(upstream)).toBe("contact@benevol.app")
    expect(contactEmail({ ...upstream, CONTACT_EMAIL: "hello@benevol.app" })).toBe("hello@benevol.app")
    expect(contactEmail({ ...other, EMAIL_REPLY_TO: "asso@example.org" })).toBe("asso@example.org")
    expect(contactEmail(other)).toBeNull()
  })

  it("shows a support link only when set (https) or on the upstream instance", () => {
    expect(supportUrl(upstream)).toBe("https://buymeacoffee.com/benevol.app")
    expect(supportUrl(other)).toBeNull()
    expect(supportUrl({ ...other, SUPPORT_URL: "https://liberapay.com/x" })).toBe("https://liberapay.com/x")
    expect(supportUrl({ ...other, SUPPORT_URL: "http://insecure.example" })).toBeNull()
  })
})

describe("public texts on another instance (#760)", () => {
  const md = "Écrivez à [contact@benevol.app](mailto:contact@benevol.app). Adresse du type `asso.benevol.app`. Ce que benevol.app ne fait pas. contact@benevol.app"

  it("leaves the upstream instance's texts untouched", () => {
    expect(localizeInstanceText(md, { NEXT_PUBLIC_APP_URL: "https://www.benevol.app" })).toBe(md)
  })

  it("puts this instance's name, domain and contact in their place", () => {
    const out = localizeInstanceText(md, { NEXT_PUBLIC_APP_URL: "https://benevoles.example.org", SITE_NAME: "Bénévoles du Jura", CONTACT_EMAIL: "aide@example.org" })
    expect(out).toBe("Écrivez à [aide@example.org](mailto:aide@example.org). Adresse du type `asso.benevoles.example.org`. Ce que Bénévoles du Jura ne fait pas. aide@example.org")
  })

  it("points to the operator page when the instance has no contact address", () => {
    const out = localizeInstanceText(md, { NEXT_PUBLIC_APP_URL: "https://benevoles.example.org" })
    expect(out).toContain("[l'exploitant de cette instance](/legal/exploitant)")
    expect(out).not.toMatch(/benevol\.app/)
  })
})
