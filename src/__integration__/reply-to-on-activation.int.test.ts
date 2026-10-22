import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #1077 against a real Postgres: an organization without a reply-to gets its first owner's address
 * when that owner activates their account through the invitation link, in the activation
 * transaction and only while it is still null. Organisers never set it, a later owner never
 * overwrites it, and the log entry carries no address.
 */

// The welcome email delivers after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))

import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { POST as acceptInvite } from "@/app/api/admin/accept-invite/route"

const url = process.env.DATABASE_URL
const tag = `int-replyto-${Date.now()}`
const password = "Correct-Horse-Battery9!"

const post = (token: string) => new Request("http://localhost/api/admin/accept-invite", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token, password }),
})

describe.skipIf(!url)("default reply-to on an owner's activation on Postgres (#1077)", () => {
  const orgIds: string[] = []

  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.orgLog.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.adminUser.deleteMany({ where: { organizationId: { in: orgIds } } })
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
    await prisma.$disconnect()
  })

  async function org(code: string, replyToEmail: string | null = null) {
    const created = await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: `${tag}-${code}`, replyToEmail } })
    orgIds.push(created.id)
    return created
  }

  async function invited(organizationId: string, code: string, role: "admin" | "organizer") {
    await prisma.adminUser.create({
      data: {
        organizationId, role, name: code, passwordHash: "x", isActive: false,
        email: `${tag}-${code}@example.org`,
        setupTokenHash: hashToken(`${tag}-${code}`),
        setupTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })
    return `${tag}-${code}`
  }

  const replyTo = async (id: string) => (await prisma.organization.findUniqueOrThrow({ where: { id } })).replyToEmail
  const defaulted = (organizationId: string) => prisma.orgLog.findMany({ where: { organizationId, action: "organization.reply_to_defaulted" } })

  it("an organiser's activation leaves it empty; the first owner's sets it; a second owner's does not overwrite it", async () => {
    const o = await org("a")
    const organiser = await invited(o.id, "a-organiser", "organizer")
    const first = await invited(o.id, "a-first", "admin")
    const second = await invited(o.id, "a-second", "admin")

    expect((await acceptInvite(post(organiser))).status).toBe(200)
    expect(await replyTo(o.id)).toBeNull()
    expect(await defaulted(o.id)).toHaveLength(0)

    expect((await acceptInvite(post(first))).status).toBe(200)
    expect(await replyTo(o.id)).toBe(`${tag}-a-first@example.org`)
    const logs = await defaulted(o.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ entityType: "Organization", entityId: o.id, actorType: "admin" })
    expect(JSON.stringify(logs[0])).not.toContain("@example.org")

    expect((await acceptInvite(post(second))).status).toBe(200)
    expect(await replyTo(o.id)).toBe(`${tag}-a-first@example.org`)
    expect(await defaulted(o.id)).toHaveLength(1)
  })

  it("keeps a reply-to the organization already has, and never touches another organization", async () => {
    const kept = await org("b", "contact@asso.example")
    const other = await org("c")
    const owner = await invited(kept.id, "b-owner", "admin")

    expect((await acceptInvite(post(owner))).status).toBe(200)
    expect(await replyTo(kept.id)).toBe("contact@asso.example")
    expect(await defaulted(kept.id)).toHaveLength(0)
    expect(await replyTo(other.id)).toBeNull()
  })
})
