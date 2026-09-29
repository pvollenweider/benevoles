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
import { decryptValue, encryptToken, keyring } from "../token-vault"

const oldKey = randomBytes(32)
const newKey = randomBytes(32)
const b64 = (k: Buffer) => k.toString("base64")

// Routes each findMany to the "legacy" or "encrypted" rows depending on the query.
function rows(legacy: unknown[], encrypted: unknown[]) {
  return vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const isLegacy = "editTokenLegacy" in where || "tokenLegacy" in where
    return isLegacy ? legacy : encrypted
  })
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.regFindMany.mockImplementation(rows([], []))
  m.leaderFindMany.mockImplementation(rows([], []))
  m.inviteFindMany.mockImplementation(rows([], []))
  for (const fn of [m.regUpdateMany, m.leaderUpdateMany, m.inviteUpdateMany]) fn.mockResolvedValue({ count: 1 })
})
afterEach(() => vi.unstubAllEnvs())

describe("encryptLegacyTokens (#290, #313)", () => {
  it("does nothing without a key", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")
    expect(await encryptLegacyTokens()).toEqual({ enabled: false })
    expect(m.regFindMany).not.toHaveBeenCalled()
  })

  it("encrypts clear-text tokens with the current key and clears them, conditionally on the value read", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", b64(newKey))
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_ID", "k2")
    m.regFindMany.mockImplementation(rows([{ id: "r1", editTokenLegacy: "reg-tok" }], []))
    m.leaderFindMany.mockImplementation(rows([{ id: "l1", tokenLegacy: "leader-tok" }], []))

    const res = await encryptLegacyTokens()
    expect(res).toMatchObject({ enabled: true, keyId: "k2", encrypted: { registrations: 1, sectorLeaders: 1, memberInvites: 0 } })

    const call = m.regUpdateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: "r1", editTokenLegacy: "reg-tok" })
    expect(call.data.editTokenLegacy).toBeNull()
    expect(call.data.editTokenEnc.startsWith("v2:k2:")).toBe(true)
    expect(decryptValue(call.data.editTokenEnc, keyring())).toBe("reg-tok")
  })

  it("re-encrypts values from a previous key and v1 values with the current key (rotation)", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", b64(newKey))
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_ID", "k2")
    vi.stubEnv("TOKEN_ENCRYPTION_PREVIOUS_KEYS", `k1:${b64(oldKey)}`)
    const fromOldKey = encryptToken("old-tok", oldKey, "k1")
    const fromV1 = encryptToken("v1-tok", oldKey)
    m.regFindMany.mockImplementation(rows([], [{ id: "r1", editTokenEnc: fromOldKey }, { id: "r2", editTokenEnc: fromV1 }]))

    const res = await encryptLegacyTokens()
    expect(res).toMatchObject({ reencrypted: { registrations: 2 } })
    const [first, second] = m.regUpdateMany.mock.calls.map((c) => c[0])
    expect(first.where).toEqual({ id: "r1", editTokenEnc: fromOldKey })
    expect(first.data.editTokenEnc.startsWith("v2:k2:")).toBe(true)
    expect(decryptValue(first.data.editTokenEnc, keyring())).toBe("old-tok")
    expect(decryptValue(second.data.editTokenEnc, keyring())).toBe("v1-tok")
  })

  it("keeps going batch after batch until drained", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", b64(newKey))
    let call = 0
    m.regFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (!("editTokenLegacy" in where)) return []
      call++
      return call === 1 ? [{ id: "r1", editTokenLegacy: "a" }, { id: "r2", editTokenLegacy: "b" }] : call === 2 ? [{ id: "r3", editTokenLegacy: "c" }] : []
    })
    const res = await encryptLegacyTokens({ batchSize: 2 })
    expect(res).toMatchObject({ encrypted: { registrations: 3 } })
  })
})
