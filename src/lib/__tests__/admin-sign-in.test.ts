import { describe, it, expect } from "vitest"
import { organizationAllowsSignIn } from "../admin-sign-in"

describe("organizationAllowsSignIn", () => {
  it("lets an owner or organizer of an active organization in", () => {
    expect(organizationAllowsSignIn({ role: "admin", organization: { active: true } })).toBe(true)
    expect(organizationAllowsSignIn({ role: "organizer", organization: { active: true } })).toBe(true)
  })
  it("locks out the admins of a disabled organization", () => {
    expect(organizationAllowsSignIn({ role: "admin", organization: { active: false } })).toBe(false)
  })
  // Regression: an account whose organization was deleted (organizationId set to NULL) passed.
  it("locks out an org account whose organization is gone", () => {
    expect(organizationAllowsSignIn({ role: "admin", organization: null })).toBe(false)
    expect(organizationAllowsSignIn({ role: "organizer", organization: null })).toBe(false)
  })
  it("lets the super admin in without an organization", () => {
    expect(organizationAllowsSignIn({ role: "super_admin", organization: null })).toBe(true)
  })
  // A suspension wins over an inconsistent `active: true`: the admins stay out until it is lifted.
  it("locks out the admins of a suspended organization, even one left active", () => {
    expect(organizationAllowsSignIn({ role: "admin", organization: { active: true, suspendedAt: new Date() } })).toBe(false)
    expect(organizationAllowsSignIn({ role: "organizer", organization: { active: false, suspendedAt: new Date() } })).toBe(false)
    expect(organizationAllowsSignIn({ role: "admin", organization: { active: true, suspendedAt: null } })).toBe(true)
  })
})
