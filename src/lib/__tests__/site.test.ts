import { describe, it, expect } from "vitest"
import { contactEmail, siteDomain, siteName, supportUrl } from "../site"

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
