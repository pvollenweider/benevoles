import { describe, it, expect } from "vitest"
import { adminInviteCheck, isExpiredInvitation, type AdminEmailHolder } from "@/lib/admin-invitation"

// #1053: an expired, never-activated invitation no longer holds an admin address.
const now = new Date("2026-10-17T12:00:00Z")
const past = new Date("2026-10-10T12:00:00Z")
const future = new Date("2026-10-20T12:00:00Z")
const row = (over: Partial<AdminEmailHolder> = {}): AdminEmailHolder => ({
  organizationId: "org-b",
  isActive: false,
  setupTokenHash: "hash",
  setupTokenExpiresAt: past,
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
  })
})
