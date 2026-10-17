// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, vi } from "vitest"
import bcrypt from "bcryptjs"
import { DUMMY_PASSWORD_HASH, verifyAdminLogin, type LoginCandidate } from "../admin-login"
import type { LoginAttempt } from "../admin-session"

type User = LoginCandidate & { id: string }

const user = (over: Partial<User> = {}): User => ({ id: "a1", isActive: true, role: "admin", passwordHash: "$2b$12$user-hash", organization: { active: true }, ...over })

function setup(found: User | null, { allowed = true, delayMs = 0, valid = true } = {}) {
  const succeeded = vi.fn(async () => {})
  const attempt: LoginAttempt = { allowed, delayMs, succeeded }
  const deps = {
    beginAttempt: vi.fn(async () => attempt),
    findUser: vi.fn(async () => found),
    compare: vi.fn(async () => valid),
    sleep: vi.fn(async () => {}),
  }
  return { deps, succeeded }
}

const creds = { email: "a@x.com", password: "pw", ip: "10.0.0.1" }

describe("verifyAdminLogin (#1048)", () => {
  it("signs in an active admin with the right password and gives the attempt back", async () => {
    const { deps, succeeded } = setup(user())
    expect(await verifyAdminLogin(creds, deps)).toMatchObject({ id: "a1" })
    expect(deps.compare).toHaveBeenCalledWith("pw", "$2b$12$user-hash")
    expect(succeeded).toHaveBeenCalledOnce()
  })

  it("refuses a wrong password and keeps the failure counted", async () => {
    const { deps, succeeded } = setup(user(), { valid: false })
    expect(await verifyAdminLogin(creds, deps)).toBeNull()
    expect(succeeded).not.toHaveBeenCalled()
  })

  it.each([
    ["an unknown address", null],
    ["a deactivated account", user({ isActive: false })],
    ["an account whose organization is disabled", user({ organization: { active: false } })],
    ["an account whose organization is gone", user({ organization: null })],
  ])("runs one dummy comparison for %s, even with its right password", async (_label, found) => {
    const { deps, succeeded } = setup(found, { valid: true })
    expect(await verifyAdminLogin(creds, deps)).toBeNull()
    expect(deps.compare).toHaveBeenCalledOnce()
    expect(deps.compare).toHaveBeenCalledWith("pw", DUMMY_PASSWORD_HASH)
    expect(succeeded).not.toHaveBeenCalled()
  })

  it("signs in the super admin, who has no organization", async () => {
    const { deps } = setup(user({ role: "super_admin", organization: null }))
    expect(await verifyAdminLogin(creds, deps)).not.toBeNull()
  })

  it("refuses a blocked attempt before looking anything up", async () => {
    const { deps } = setup(user(), { allowed: false })
    expect(await verifyAdminLogin(creds, deps)).toBeNull()
    expect(deps.findUser).not.toHaveBeenCalled()
    expect(deps.compare).not.toHaveBeenCalled()
  })

  it("waits the account's delay before checking the password", async () => {
    const { deps } = setup(user(), { delayMs: 4000 })
    await verifyAdminLogin(creds, deps)
    expect(deps.sleep).toHaveBeenCalledWith(4000)
    expect(deps.sleep.mock.invocationCallOrder[0]).toBeLessThan(deps.compare.mock.invocationCallOrder[0])
  })
})

describe("DUMMY_PASSWORD_HASH", () => {
  it("is a valid bcrypt hash at the cost of the passwords set today", async () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(12)
    expect(await bcrypt.compare("anything", DUMMY_PASSWORD_HASH)).toBe(false)
  })
})
