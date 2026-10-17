import { describe, it, expect } from "vitest"
import { adminInviteCheck, isExpiredInvitation, isReleasableInvitation, withInvitedAdmin, type AdminEmailHolder } from "@/lib/admin-invitation"

// #1053: an expired, never-activated invitation no longer holds an admin address.
const now = new Date("2026-10-17T12:00:00Z")
const past = new Date("2026-10-10T12:00:00Z")
const future = new Date("2026-10-20T12:00:00Z")
const row = (over: Partial<AdminEmailHolder> = {}): AdminEmailHolder => ({
  organizationId: "org-b",
  isActive: false,
  setupTokenHash: "hash",
  setupTokenExpiresAt: past,
  organizationHasActiveAdmin: true,
  ...over,
})

describe("isExpiredInvitation", () => {
  it("is true only for an inactive account whose setup link has expired", () => {
    expect(isExpiredInvitation(row(), now)).toBe(true)
  })

  it("is false for an invitation still valid, including at the exact expiry instant", () => {
    expect(isExpiredInvitation(row({ setupTokenExpiresAt: future }), now)).toBe(false)
    expect(isExpiredInvitation(row({ setupTokenExpiresAt: now }), now)).toBe(false)
  })

  it("is false for an active account, even with leftover token fields", () => {
    expect(isExpiredInvitation(row({ isActive: true }), now)).toBe(false)
    expect(isExpiredInvitation(row({ isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }), now)).toBe(false)
  })

  it("is false for an inactive account without a setup link or without an expiry", () => {
    expect(isExpiredInvitation(row({ setupTokenHash: null }), now)).toBe(false)
    expect(isExpiredInvitation(row({ setupTokenExpiresAt: null }), now)).toBe(false)
  })
})

describe("isReleasableInvitation", () => {
  it("frees an expired invitation into a team that has an active administrator", () => {
    expect(isReleasableInvitation(row(), now)).toBe(true)
  })

  it("keeps the first account of a space with no active administrator (sign-up owner, operator-created)", () => {
    expect(isReleasableInvitation(row({ organizationHasActiveAdmin: false }), now)).toBe(false)
  })

  it("waits an hour after the expiry, so an activation checked just before it always finishes", () => {
    expect(isReleasableInvitation(row({ setupTokenExpiresAt: new Date(now.getTime() - 59 * 60 * 1000) }), now)).toBe(false)
    expect(isReleasableInvitation(row({ setupTokenExpiresAt: new Date(now.getTime() - 61 * 60 * 1000) }), now)).toBe(true)
  })

  it("keeps a valid invitation and an active account", () => {
    expect(isReleasableInvitation(row({ setupTokenExpiresAt: future }), now)).toBe(false)
    expect(isReleasableInvitation(row({ isActive: true }), now)).toBe(false)
  })
})

describe("adminInviteCheck", () => {
  it("is free when nobody holds the address", () => {
    expect(adminInviteCheck(null, "org-a", now)).toBe("free")
  })

  it("replaces an expired invitation, from this organisation or another one", () => {
    expect(adminInviteCheck(row({ organizationId: "org-a" }), "org-a", now)).toBe("replace")
    expect(adminInviteCheck(row({ organizationId: "org-b" }), "org-a", now)).toBe("replace")
  })

  it("tells this organisation its own member or valid invitation", () => {
    expect(adminInviteCheck(row({ organizationId: "org-a", isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }), "org-a", now)).toBe("same_org")
    expect(adminInviteCheck(row({ organizationId: "org-a", setupTokenExpiresAt: future }), "org-a", now)).toBe("same_org")
  })

  it("names nothing for an active account or a valid invitation elsewhere, or a platform account", () => {
    expect(adminInviteCheck(row({ isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }), "org-a", now)).toBe("unavailable")
    expect(adminInviteCheck(row({ setupTokenExpiresAt: future }), "org-a", now)).toBe("unavailable")
    expect(adminInviteCheck(row({ organizationId: null, isActive: true, setupTokenHash: null, setupTokenExpiresAt: null }), "org-a", now)).toBe("unavailable")
    // The expired first account of another space stays: the operator can still send it a new link.
    expect(adminInviteCheck(row({ organizationHasActiveAdmin: false }), "org-a", now)).toBe("unavailable")
  })
})

describe("withInvitedAdmin", () => {
  it("puts the new row in place of the pending row with the same address, whatever its case", () => {
    const list = [{ id: "a1", email: "alice@x.ch", isActive: true }, { id: "old", email: "Camille@Example.org", isActive: false }, { id: "a2", email: "bob@x.ch", isActive: true }]
    expect(withInvitedAdmin(list, { id: "new", email: "camille@example.org", isActive: false }).map((a) => a.id)).toEqual(["a1", "new", "a2"])
  })

  it("appends a first invitation and never drops an active member", () => {
    expect(withInvitedAdmin([{ id: "a1", email: "alice@x.ch", isActive: true }], { id: "new", email: "n@x.ch", isActive: false }).map((a) => a.id)).toEqual(["a1", "new"])
    expect(withInvitedAdmin([{ id: "a1", email: "alice@x.ch", isActive: true }], { id: "new", email: "alice@x.ch", isActive: false }).map((a) => a.id)).toEqual(["a1", "new"])
  })
})
