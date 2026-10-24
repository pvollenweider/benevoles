import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"

/**
 * Password-reset and invitation links against a real Postgres: a link is consumed once, by a
 * conditional update. Two requests with the same link that both passed the lookup can't both
 * change the password; a link replaced or expired while the password was being hashed changes
 * nothing; an activation queues one welcome email at most. The activation POST is budgeted
 * before bcrypt, also against the Postgres limiter store.
 */

// The welcome email delivers after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))

// Runs between the lookup and the conditional update of each request: real bcrypt, then the hook.
const afterHash = vi.hoisted(() => ({ fn: null as null | (() => Promise<void>) }))
vi.mock("bcryptjs", async (importOriginal) => {
  const real = (await importOriginal<{ default: typeof import("bcryptjs") }>()).default
  return {
    default: {
      ...real,
      hash: async (password: string, rounds: number) => {
        const hashed = await real.hash(password, 4)
        void rounds
        if (afterHash.fn) await afterHash.fn()
        return hashed
      },
    },
  }
})

import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { postgresStore } from "@/lib/rate-limit"
import { activationAllowed, activationTokenDigest, ACTIVATION_MAX_PER_TOKEN } from "@/lib/activation-budget"
import { POST as resetPassword } from "@/app/api/public/reset-password/route"
import { POST as acceptInvite } from "@/app/api/admin/accept-invite/route"

const url = process.env.DATABASE_URL
const tag = `int-single-use-${Date.now()}`
const PASSWORDS = ["Correct-Horse-Battery9!", "Another-Staple-Battery8?"]

const ip = () => `198.51.100.${Math.floor(Math.random() * 250)}-${Math.random()}`
const postJson = (path: string, body: unknown) => new Request(`http://localhost${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-forwarded-for": ip() },
  body: JSON.stringify(body),
})
const reset = (token: string, password: string) => resetPassword(postJson("/api/public/reset-password", { token, password }))
const activate = (token: string, password: string) => acceptInvite(postJson("/api/admin/accept-invite", { token, password }))

/** Hook that holds every request until `n` of them have hashed their password, then lets them race. */
function barrier(n: number) {
  let arrived = 0
  let open!: () => void
  const opened = new Promise<void>((resolve) => { open = resolve })
  return async () => {
    arrived++
    if (arrived >= n) open()
    await opened
  }
}

describe.skipIf(!url)("single-use links on Postgres", () => {
  let orgId = ""

  beforeEach(() => { afterHash.fn = null })

  afterAll(async () => {
    afterHash.fn = null
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.orgLog.deleteMany({ where: { organizationId: orgId } })
    }
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    if (orgId) await prisma.organization.delete({ where: { id: orgId } })
    await prisma.$disconnect()
  })

  async function organization() {
    if (!orgId) orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag } })).id
    return orgId
  }

  async function withResetLink(code: string, expiresInMs = 60 * 60 * 1000) {
    const admin = await prisma.adminUser.create({
      data: {
        organizationId: await organization(), role: "admin", name: code, passwordHash: "old-hash",
        email: `${tag}-${code}@example.org`,
        passwordResetTokenHash: hashToken(`${tag}-${code}`),
        passwordResetExpiresAt: new Date(Date.now() + expiresInMs),
      },
    })
    return { admin, token: `${tag}-${code}` }
  }

  async function withInvite(code: string) {
    const admin = await prisma.adminUser.create({
      data: {
        organizationId: await organization(), role: "organizer", name: code, passwordHash: "old-hash", isActive: false,
        email: `${tag}-${code}@example.org`,
        setupTokenHash: hashToken(`${tag}-${code}`),
        setupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    return { admin, token: `${tag}-${code}` }
  }

  const reload = (id: string) => prisma.adminUser.findUniqueOrThrow({ where: { id } })
  const welcomes = (adminId: string) => prisma.notificationOutbox.count({ where: { dedupeKey: `admin_welcome:${adminId}` } })

  describe("password reset", () => {
    it("two concurrent requests with the same link: exactly one changes the password, once", async () => {
      const { admin, token } = await withResetLink("r-race")
      afterHash.fn = barrier(2)
      const res = await Promise.all(PASSWORDS.map((p) => reset(token, p)))
      expect(res.map((r) => r.status).sort()).toEqual([200, 400])

      const after = await reload(admin.id)
      // Old sessions end, exactly once; the link is gone.
      expect(after.sessionVersion).toBe(admin.sessionVersion + 1)
      expect(after.passwordResetTokenHash).toBeNull()
      const winner = PASSWORDS[res.findIndex((r) => r.status === 200)]
      const loser = PASSWORDS[res.findIndex((r) => r.status === 400)]
      expect(await bcrypt.compare(winner, after.passwordHash)).toBe(true)
      expect(await bcrypt.compare(loser, after.passwordHash)).toBe(false)
    })

    it("a used link is refused", async () => {
      const { admin, token } = await withResetLink("r-reuse")
      expect((await reset(token, PASSWORDS[0])).status).toBe(200)
      const used = await reload(admin.id)
      expect((await reset(token, PASSWORDS[1])).status).toBe(400)
      const after = await reload(admin.id)
      expect(after.passwordHash).toBe(used.passwordHash)
      expect(after.sessionVersion).toBe(used.sessionVersion)
    })

    it("a link replaced by a newer request while the password was hashed changes nothing", async () => {
      const { admin, token } = await withResetLink("r-replaced")
      afterHash.fn = async () => {
        await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordResetTokenHash: hashToken(`${token}-newer`) } })
      }
      expect((await reset(token, PASSWORDS[0])).status).toBe(400)
      const after = await reload(admin.id)
      expect(after.passwordHash).toBe("old-hash")
      expect(after.sessionVersion).toBe(admin.sessionVersion)
      expect(after.passwordResetTokenHash).toBe(hashToken(`${token}-newer`))
    })

    it("a link that expired while the password was hashed changes nothing", async () => {
      const { admin, token } = await withResetLink("r-expired")
      afterHash.fn = async () => {
        await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordResetExpiresAt: new Date(Date.now() - 1000) } })
      }
      expect((await reset(token, PASSWORDS[0])).status).toBe(400)
      const after = await reload(admin.id)
      expect(after.passwordHash).toBe("old-hash")
      expect(after.sessionVersion).toBe(admin.sessionVersion)
    })
  })

  describe("invitation activation", () => {
    it("two concurrent requests with the same link: one activates, one welcome email", async () => {
      const { admin, token } = await withInvite("a-race")
      afterHash.fn = barrier(2)
      const res = await Promise.all(PASSWORDS.map((p) => activate(token, p)))
      expect(res.map((r) => r.status).sort()).toEqual([200, 404])

      const after = await reload(admin.id)
      expect(after.isActive).toBe(true)
      expect(after.setupTokenHash).toBeNull()
      const winner = PASSWORDS[res.findIndex((r) => r.status === 200)]
      expect(await bcrypt.compare(winner, after.passwordHash)).toBe(true)
      expect(await welcomes(admin.id)).toBe(1)
    })

    it("a used link is refused and queues nothing more", async () => {
      const { admin, token } = await withInvite("a-reuse")
      expect((await activate(token, PASSWORDS[0])).status).toBe(200)
      const used = await reload(admin.id)
      expect((await activate(token, PASSWORDS[1])).status).toBe(404)
      expect((await reload(admin.id)).passwordHash).toBe(used.passwordHash)
      expect(await welcomes(admin.id)).toBe(1)
    })

    it("a link replaced by a new invitation while the password was hashed activates nothing", async () => {
      const { admin, token } = await withInvite("a-replaced")
      afterHash.fn = async () => {
        await prisma.adminUser.update({ where: { id: admin.id }, data: { setupTokenHash: hashToken(`${token}-new`) } })
      }
      expect((await activate(token, PASSWORDS[0])).status).toBe(404)
      const after = await reload(admin.id)
      expect(after.isActive).toBe(false)
      expect(after.passwordHash).toBe("old-hash")
      expect(await welcomes(admin.id)).toBe(0)
    })

    it("a link that expired while the password was hashed activates nothing", async () => {
      const { admin, token } = await withInvite("a-expired")
      afterHash.fn = async () => {
        await prisma.adminUser.update({ where: { id: admin.id }, data: { setupTokenExpiresAt: new Date(Date.now() - 1000) } })
      }
      const res = await activate(token, PASSWORDS[0])
      expect(res.status).toBe(410)
      const after = await reload(admin.id)
      expect(after.isActive).toBe(false)
      expect(after.passwordHash).toBe("old-hash")
      expect(await welcomes(admin.id)).toBe(0)
    })

    it("parallel requests on one link: past the budget they are refused before bcrypt", async () => {
      const { admin, token } = await withInvite("a-flood")
      let hashed = 0
      afterHash.fn = async () => { hashed++ }
      const res = await Promise.all(Array.from({ length: 12 }, () => activate(token, PASSWORDS[0])))
      expect(res.filter((r) => r.status === 429)).toHaveLength(12 - ACTIVATION_MAX_PER_TOKEN)
      expect(res.filter((r) => r.status === 200)).toHaveLength(1)
      expect(hashed).toBe(ACTIVATION_MAX_PER_TOKEN)
      expect(await welcomes(admin.id)).toBe(1)
    })
  })

  it("the activation budget holds with the shared Postgres limiter under parallel calls", async () => {
    const token = `${tag}-budget`
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => activationAllowed(`203.0.113.${i}`, token, postgresStore)))
    expect(results.filter(Boolean)).toHaveLength(ACTIVATION_MAX_PER_TOKEN)
    const row = await prisma.rateLimit.findUniqueOrThrow({ where: { key: `accept-invite-token:${activationTokenDigest(token)}` } })
    // Refused calls gave their reservation back.
    expect(row.count).toBe(ACTIVATION_MAX_PER_TOKEN)
    await prisma.rateLimit.deleteMany({
      where: { OR: [{ key: row.key }, ...Array.from({ length: 12 }, (_, i) => ({ key: `accept-invite-ip:203.0.113.${i}` }))] },
    })
  })
})
