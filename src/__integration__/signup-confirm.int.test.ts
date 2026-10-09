import { describe, it, expect, vi, afterAll } from "vitest"

/**
 * Self-service sign-up confirmation (#810, part 4b) against a real Postgres: the space is created
 * awaiting validation with an inactive owner, once; expired, used and taken requests are refused.
 */

const notify = vi.hoisted(() => vi.fn())
vi.mock("@/lib/operator-alerts", () => ({ notifyOperator: notify }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { confirmSignupRequest, signupRequestState } from "@/lib/signup-server"
import { openPayload } from "@/lib/notifications/outbox"

const url = process.env.DATABASE_URL
const tag = `int-signup-${Date.now()}`
const startedAt = new Date()

/** This test's platform emails (no organisation), payloads opened: stored encrypted with TOKEN_ENCRYPTION_KEY. */
async function ownEmails() {
  const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: null, createdAt: { gte: startedAt } } })
  return rows.map((row) => ({ row, payload: openPayload(row.payload) })).filter(({ payload }) => payload.recipient.email?.startsWith(tag))
}

async function request(code: string, over: { email?: string; expiresAt?: Date } = {}) {
  return prisma.signupRequest.create({
    data: {
      organizationName: `Fête ${tag}`,
      contactName: "Camille",
      description: "Fête de village, une centaine de bénévoles.",
      email: over.email ?? `${tag}-${code}@example.org`,
      tokenHash: hashToken(`${tag}-${code}`),
      expiresAt: over.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    },
  })
}

describe.skipIf(!url)("sign-up confirmation on Postgres (#810)", () => {
  const orgIds: string[] = []

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { id: { in: (await ownEmails()).map(({ row }) => row.id) } } })
    await prisma.signupRequest.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    await prisma.$disconnect()
  })

  it("creates the space awaiting validation and an inactive owner, once, and tells the operator", async () => {
    await request("a")
    expect((await signupRequestState(`${tag}-a`)).state).toBe("ok")

    const result = await confirmSignupRequest(`${tag}-a`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.inviteUrl).toContain("/admin/accept-invite?token=")

    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: result.organizationSlug }, include: { admins: true } })
    orgIds.push(org.id)
    expect(org.active).toBe(true)
    expect(org.publicationApprovedAt).toBeNull()
    expect(org.outboundEmailApprovedAt).toBeNull()
    expect(org.signupDescription).toBe("Fête de village, une centaine de bénévoles.")
    // The statistics (#810): marked as a sign-up space, counted by the database triggers.
    expect(org.signupAt).toBeInstanceOf(Date)
    const counters = await prisma.platformCounter.findMany({ where: { metric: { in: ["signup_requests", "signup_spaces"] } } })
    expect(counters.map((c) => c.metric).sort()).toEqual(["signup_requests", "signup_spaces"])
    expect(org.admins).toHaveLength(1)
    expect(org.admins[0]).toMatchObject({ email: `${tag}-a@example.org`, role: "admin", isActive: false })
    expect(org.admins[0].setupTokenHash).toBeTruthy()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ key: `signup:${org.id}`, priority: 4, message: expect.stringContaining("« Fête de village, une centaine de bénévoles. »") }))

    // The link to choose a password also leaves by email, as a platform email (no organisation:
    // the space awaits validation and the account is inactive), to the confirmed address only.
    const links = (await ownEmails()).filter(({ payload }) => payload.kind === "signup_account_link" && payload.recipient.email === `${tag}-a@example.org`)
    expect(links).toHaveLength(1)
    expect(links[0].row.organizationId).toBeNull()
    expect((links[0].payload.data as { inviteUrl: string }).inviteUrl).toBe(result.inviteUrl)

    // A second click: refused, nothing more created.
    expect(await confirmSignupRequest(`${tag}-a`)).toEqual({ ok: false, reason: "used" })
    expect((await signupRequestState(`${tag}-a`)).state).toBe("used")
  })

  it("refuses an expired, an unknown, and an already-taken address", async () => {
    await request("b", { expiresAt: new Date(Date.now() - 1000) })
    expect(await confirmSignupRequest(`${tag}-b`)).toEqual({ ok: false, reason: "expired" })
    expect(await confirmSignupRequest(`${tag}-nope`)).toEqual({ ok: false, reason: "unknown" })

    await prisma.adminUser.create({ data: { email: `${tag}-taken@example.org`, name: "X", passwordHash: "x", role: "admin" } })
    await request("c", { email: `${tag}-taken@example.org` })
    expect(await confirmSignupRequest(`${tag}-c`)).toEqual({ ok: false, reason: "taken" })
  })
})
