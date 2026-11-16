import { describe, it, expect } from "vitest"
import { LINKS_OPEN_WHERE, ORG_UNAVAILABLE_CODE, isOrgUnavailable, orgLinksOpen, orgUnavailableContact, orgUnavailableCopy } from "../org-lifecycle"

describe("orgLinksOpen", () => {
  it("opens the links of an active organisation", () => {
    expect(orgLinksOpen({ active: true, suspendedAt: null })).toBe(true)
  })
  it("closes them once the organisation is deactivated, by the operator or for inactivity", () => {
    expect(orgLinksOpen({ active: false, suspendedAt: null })).toBe(false)
  })
  it("closes them while it is suspended, even if an inconsistent write left it active", () => {
    expect(orgLinksOpen({ active: false, suspendedAt: new Date() })).toBe(false)
    expect(orgLinksOpen({ active: true, suspendedAt: new Date() })).toBe(false)
    expect(orgLinksOpen({ active: true, suspendedAt: "2026-10-24T10:00:00Z" })).toBe(false)
  })
  it("closes them when the organisation is missing", () => {
    expect(orgLinksOpen(null)).toBe(false)
    expect(orgLinksOpen(undefined)).toBe(false)
  })
  it("matches the database filter", () => {
    expect(LINKS_OPEN_WHERE).toEqual({ active: true, suspendedAt: null })
  })
})

describe("isOrgUnavailable", () => {
  it("recognises the refusal by its code only", () => {
    expect(isOrgUnavailable({ error: "x", code: ORG_UNAVAILABLE_CODE })).toBe(true)
    expect(isOrgUnavailable({ error: "Lien introuvable." })).toBe(false)
    expect(isOrgUnavailable(null)).toBe(false)
    expect(isOrgUnavailable("org_unavailable")).toBe(false)
  })
})

describe("orgUnavailableCopy", () => {
  it("addresses volunteers with « tu » and sector leaders with « vous »", () => {
    expect(orgUnavailableCopy("volunteer").contactIntro).toMatch(/ écris à$/)
    expect(orgUnavailableCopy("volunteer").text).toMatch(/\btes inscriptions\b/)
    expect(orgUnavailableCopy("leader").contactIntro).toMatch(/ écrivez à$/)
    expect(orgUnavailableCopy("leader").contactOutro).toMatch(/\bvotre demande\b/)
  })
  it("never tells a suspension from a deactivation", () => {
    for (const audience of ["volunteer", "leader"] as const) {
      const all = Object.values(orgUnavailableCopy(audience)).join(" ")
      expect(all).not.toMatch(/suspen|désactiv|abus/i)
    }
  })
})

describe("orgUnavailableContact", () => {
  it("reads the contact address sent with the refusal, nothing else", () => {
    expect(orgUnavailableContact({ code: ORG_UNAVAILABLE_CODE, contact: "aide@example.org" })).toBe("aide@example.org")
    expect(orgUnavailableContact({ code: ORG_UNAVAILABLE_CODE, contact: null })).toBeNull()
    expect(orgUnavailableContact({ code: ORG_UNAVAILABLE_CODE, contact: "javascript:alert(1)@x" })).toBeNull()
    expect(orgUnavailableContact(null)).toBeNull()
  })
})
