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

async function request(code: string, over: { email?: string; expiresAt?: Date; source?: string; sourceDetail?: string } = {}) {
  return prisma.signupRequest.create({
    data: {
      organizationName: `Fête ${tag}`,
      contactName: "Camille",
      description: "Fête de village, une centaine de bénévoles.",
      email: over.email ?? `${tag}-${code}@example.org`,
      tokenHash: hashToken(`${tag}-${code}`),
      expiresAt: over.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      source: over.source,
      sourceDetail: over.sourceDetail,
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
    // No answer to « Comment avez-vous connu … ? » (#1094): nothing copied.
    expect(org.signupSource).toBeNull()
    expect(org.signupSourceDetail).toBeNull()
    // The statistics (#810): marked as a sign-up space, counted by the database triggers.
    expect(org.signupAt).toBeInstanceOf(Date)
    const counters = await prisma.platformCounter.findMany({ where: { metric: { in: ["signup_requests", "signup_spaces"] } } })
    expect(counters.map((c) => c.metric).sort()).toEqual(["signup_requests", "signup_spaces"])
    expect(org.admins).toHaveLength(1)
    expect(org.admins[0]).toMatchObject({ email: `${tag}-a@example.org`, role: "admin", isActive: false })
    // Replies to the space's emails reach its owner by default (#1067).
    expect(org.replyToEmail).toBe(`${tag}-a@example.org`)
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

  it("copies the « Comment avez-vous connu … ? » answer to the space (#1094)", async () => {
    await request("src", { source: "other", sourceDetail: "la newsletter de la commune" })
    const result = await confirmSignupRequest(`${tag}-src`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: result.organizationSlug } })
    orgIds.push(org.id)
    expect(org).toMatchObject({ signupSource: "other", signupSourceDetail: "la newsletter de la commune" })
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

describe.skipIf(!url)("an expired admin invitation frees the address on Postgres (#1053)", () => {
  const DAY = 24 * 60 * 60 * 1000
  const orgIds: string[] = []

  afterAll(async () => {
    await prisma.signupRequest.deleteMany({ where: { email: { startsWith: `${tag}-inv` } } })
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: `${tag}-inv` } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
  })

  async function otherOrg() {
    const org = await prisma.organization.create({ data: { name: `Autre ${tag}`, slug: `${tag}-autre-${orgIds.length}` } })
    orgIds.push(org.id)
    return org
  }

  it("replaces only an expired, never-activated invitation, and never an active account or a valid invitation", async () => {
    const { findAdminEmailHolder, releaseExpiredInvitation } = await import("@/lib/admin-invitation-server")
    const org = await otherOrg()
    const now = new Date()
    const make = (code: string, data: object) => prisma.adminUser.create({ data: { email: `${tag}-inv-${code}@example.org`, name: code, passwordHash: "x", organizationId: org.id, ...data } })
    await make("active", { isActive: true })
    await make("valid", { isActive: false, setupTokenHash: `${tag}-h-valid`, setupTokenExpiresAt: new Date(now.getTime() + DAY) })
    await make("expired", { isActive: false, setupTokenHash: `${tag}-h-expired`, setupTokenExpiresAt: new Date(now.getTime() - DAY) })

    for (const code of ["active", "valid"]) {
      const holder = await findAdminEmailHolder(prisma, `${tag}-INV-${code}@Example.org`)
      expect(holder).not.toBeNull()
      expect(await releaseExpiredInvitation(prisma, holder!, now)).toBe(false)
      expect(await prisma.adminUser.count({ where: { email: `${tag}-inv-${code}@example.org` } })).toBe(1)
    }
    const expired = await findAdminEmailHolder(prisma, `${tag}-inv-expired@example.org`)
    // Renewed meanwhile (a new link from the operator): the row read earlier is no longer replaced.
    await prisma.adminUser.update({ where: { id: expired!.id }, data: { setupTokenHash: `${tag}-h-renewed` } })
    expect(await releaseExpiredInvitation(prisma, expired!, now)).toBe(false)
    const renewed = await findAdminEmailHolder(prisma, `${tag}-inv-expired@example.org`)
    expect(await releaseExpiredInvitation(prisma, renewed!, now)).toBe(true)
    expect(await prisma.adminUser.count({ where: { email: `${tag}-inv-expired@example.org` } })).toBe(0)
  })

  it("lets the person sign up and confirm over another organisation's expired invitation", async () => {
    const org = await otherOrg()
    await prisma.adminUser.create({ data: { email: `${tag}-inv-owner@example.org`, name: "Owner", passwordHash: "x", organizationId: org.id, isActive: true } })
    const email = `${tag}-inv-signup@example.org`
    await prisma.adminUser.create({ data: { email, name: "Invité", passwordHash: "x", organizationId: org.id, isActive: false, setupTokenHash: `${tag}-h-signup`, setupTokenExpiresAt: new Date(Date.now() - DAY) } })
    await request("inv-signup", { email })

    const result = await confirmSignupRequest(`${tag}-inv-signup`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const created = await prisma.organization.findUniqueOrThrow({ where: { slug: result.organizationSlug }, include: { admins: true } })
    orgIds.push(created.id)
    expect(created.admins.map((a) => a.email)).toEqual([email])
    expect(await prisma.adminUser.count({ where: { organizationId: org.id } })).toBe(1)
  })

  it("keeps the expired first account of a space with no active admin", async () => {
    const { findAdminEmailHolder, releaseExpiredInvitation } = await import("@/lib/admin-invitation-server")
    const org = await otherOrg()
    const email = `${tag}-inv-first@example.org`
    await prisma.adminUser.create({ data: { email, name: "Premier", passwordHash: "x", organizationId: org.id, isActive: false, setupTokenHash: `${tag}-h-first`, setupTokenExpiresAt: new Date(Date.now() - DAY) } })
    const holder = await findAdminEmailHolder(prisma, email)
    expect(holder?.organizationHasActiveAdmin).toBe(false)
    expect(await releaseExpiredInvitation(prisma, holder!, new Date())).toBe(false)
    await request("inv-first", { email })
    expect(await confirmSignupRequest(`${tag}-inv-first`)).toEqual({ ok: false, reason: "taken" })
    expect(await prisma.adminUser.count({ where: { email } })).toBe(1)
  })
})

afterAll(async () => { await prisma.$disconnect() })
