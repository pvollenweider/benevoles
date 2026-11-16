import { describe, it, expect, vi } from "vitest"

vi.mock("../prisma", () => ({ prisma: {} }))
vi.mock("../notifications/outbox", () => ({ enqueueNotifications: vi.fn() }))

import { accountLink, tokenFromUrl } from "../outbox-recipient-check"
import { recoveryStillCurrent, resetLink } from "../password-recovery"

describe("accountLink: the single-use link an account email carries", () => {
  it("reads the token of each account email from its link", () => {
    expect(accountLink({ kind: "password_reset", data: { resetUrl: resetLink("https://app.test/", "abc") } })).toEqual({ column: "passwordResetTokenHash", token: "abc" })
    expect(accountLink({ kind: "admin_invite", data: { inviteUrl: "https://app.test/admin/accept-invite?token=xyz" } })).toEqual({ column: "setupTokenHash", token: "xyz" })
    expect(accountLink({ kind: "signup_account_link", data: { inviteUrl: "https://app.test/admin/accept-invite?token=xyz" } })).toEqual({ column: "setupTokenHash", token: "xyz" })
    expect(accountLink({ kind: "org_reactivation", data: { reactivateUrl: "https://app.test/admin/reactivate/confirm?token=r1" } })).toEqual({ column: "orgReactivationTokenHash", token: "r1" })
  })

  it("nothing for other kinds or a link without token", () => {
    expect(accountLink({ kind: "admin_welcome", data: { inviteUrl: "https://app.test/?token=x" } })).toBeNull()
    expect(accountLink({ kind: "password_reset", data: { resetUrl: "https://app.test/admin/reset-password" } })).toBeNull()
    expect(accountLink({ kind: "password_reset", data: {} })).toBeNull()
    expect(tokenFromUrl("not a url")).toBeNull()
    expect(tokenFromUrl(42)).toBeNull()
  })
})

describe("recoveryStillCurrent: a recovery request writes a link only for the account it read", () => {
  const read = { email: "a@x.ch", sessionVersion: 3 }
  it("same address, same sessionVersion, still active", () => {
    expect(recoveryStillCurrent(read, { email: "a@x.ch", sessionVersion: 3, isActive: true })).toBe(true)
  })
  it("not after a password change, an address change or a deactivation", () => {
    expect(recoveryStillCurrent(read, { email: "a@x.ch", sessionVersion: 4, isActive: true })).toBe(false)
    expect(recoveryStillCurrent(read, { email: "b@x.ch", sessionVersion: 3, isActive: true })).toBe(false)
    expect(recoveryStillCurrent(read, { email: "a@x.ch", sessionVersion: 3, isActive: false })).toBe(false)
    expect(recoveryStillCurrent(read, null)).toBe(false)
  })
})
