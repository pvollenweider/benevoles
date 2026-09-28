import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { randomBytes } from "crypto"

const m = vi.hoisted(() => ({
  regFindMany: vi.fn(), regUpdateMany: vi.fn(),
  leaderFindMany: vi.fn(), leaderUpdateMany: vi.fn(),
  inviteFindMany: vi.fn(), inviteUpdateMany: vi.fn(),
}))
vi.mock("../prisma", () => ({
  prisma: {
    registration: { findMany: m.regFindMany, updateMany: m.regUpdateMany },
    sectorLeader: { findMany: m.leaderFindMany, updateMany: m.leaderUpdateMany },
    memberInvite: { findMany: m.inviteFindMany, updateMany: m.inviteUpdateMany },
  },
}))

import { encryptLegacyTokens } from "../token-encryption-job"
import { decryptToken } from "../token-vault"

const keyB64 = randomBytes(32).toString("base64")

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.regFindMany.mockResolvedValue([])
  m.leaderFindMany.mockResolvedValue([])
  m.inviteFindMany.mockResolvedValue([])
  for (const fn of [m.regUpdateMany, m.leaderUpdateMany, m.inviteUpdateMany]) fn.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.unstubAllEnvs())

describe("encryptLegacyTokens (#290)", () => {
  it("does nothing without a key", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")
    expect(await encryptLegacyTokens()).toEqual({ enabled: false })
    expect(m.regFindMany).not.toHaveBeenCalled()
  })

  it("encrypts and clears clear-text tokens, conditionally on the value read", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", keyB64)
    m.regFindMany.mockResolvedValueOnce([{ id: "r1", editTokenLegacy: "reg-tok" }])
    m.leaderFindMany.mockResolvedValueOnce([{ id: "l1", tokenLegacy: "leader-tok" }])
    m.inviteFindMany.mockResolvedValueOnce([{ id: "i1", tokenLegacy: "invite-tok" }])

    expect(await encryptLegacyTokens()).toEqual({ enabled: true, encrypted: { registrations: 1, sectorLeaders: 1, memberInvites: 1 } })

    const call = m.regUpdateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: "r1", editTokenLegacy: "reg-tok" })
    expect(call.data.editTokenLegacy).toBeNull()
    expect(decryptToken(call.data.editTokenEnc, Buffer.from(keyB64, "base64"))).toBe("reg-tok")
    expect(m.leaderUpdateMany.mock.calls[0][0].data.tokenLegacy).toBeNull()
    expect(m.inviteUpdateMany.mock.calls[0][0].data.tokenLegacy).toBeNull()
  })

  it("keeps going batch after batch until drained", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", keyB64)
    m.regFindMany
      .mockResolvedValueOnce([{ id: "r1", editTokenLegacy: "a" }, { id: "r2", editTokenLegacy: "b" }])
      .mockResolvedValueOnce([{ id: "r3", editTokenLegacy: "c" }])
    const res = await encryptLegacyTokens({ batchSize: 2 })
    expect(m.regFindMany).toHaveBeenCalledTimes(2)
    expect(res).toMatchObject({ encrypted: { registrations: 3 } })
  })
})
