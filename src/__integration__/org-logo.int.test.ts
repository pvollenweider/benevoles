import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"

/**
 * Organization logo (#300) against a real Postgres: the bytes round-trip through the bytea column,
 * the org-scoped client only ever reaches its own organization's logo, the public route serves
 * an active organization's logo and nothing else, and the logo is purged with its organization
 * (the cleanup cron deletes deactivated organizations with `organization.deleteMany`, cascading).
 */

// The session that asks for a pending space's logo (#810); next-auth itself does not load here.
const session = vi.hoisted(() => ({ current: null as null | { user: { role: string; organizationId: string | null } } }))
vi.mock("@/auth", () => ({ auth: async () => session.current }))

import sharp from "sharp"
import { prisma } from "@/lib/prisma"
import { getOrgClient, TenantAccessError } from "@/lib/prisma-org"
import { processLogo } from "@/lib/org-logo-image"
import { logoVersion } from "@/lib/org-logo"
import { GET } from "@/app/api/public/organizations/[id]/logo/route"

const url = process.env.DATABASE_URL
const tag = `int-logo-${Date.now()}`

async function processed(color: string) {
  const png = await sharp({ create: { width: 800, height: 400, channels: 4, background: color } }).png().toBuffer()
  const result = await processLogo(png)
  if (!result.ok) throw new Error(result.error)
  return result.logo
}

const get = (orgId: string, v?: string) =>
  GET(new Request(`http://localhost/api/public/organizations/${orgId}/logo${v ? `?v=${v}` : ""}`), { params: Promise.resolve({ id: orgId }) })

describe.skipIf(!url)("OrganizationLogo (#300)", () => {
  let orgA = ""
  let orgB = ""

  beforeAll(async () => {
    orgA = (await prisma.organization.create({ data: { name: "Org A", slug: `${tag}-a` } })).id
    orgB = (await prisma.organization.create({ data: { name: "Org B", slug: `${tag}-b` } })).id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  it("stores, replaces and serves the logo through the org-scoped client", async () => {
    const db = getOrgClient(orgA)
    const first = await processed("#123456")
    const fields = { data: new Uint8Array(first.data), mimeType: first.mimeType, width: first.width, height: first.height, hash: first.hash }
    await db.organizationLogo.upsert({ where: { organizationId: orgA }, create: { organizationId: orgA, ...fields }, update: fields })

    const res = await get(orgA, logoVersion(first.hash))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    expect(res.headers.get("Cache-Control")).toContain("immutable")
    expect(Buffer.from(await res.arrayBuffer()).equals(first.data)).toBe(true)

    // Replaced in place: still one row, the new hash, the old version now only revalidated.
    const second = await processed("#654321")
    const next = { data: new Uint8Array(second.data), mimeType: second.mimeType, width: second.width, height: second.height, hash: second.hash }
    await db.organizationLogo.upsert({ where: { organizationId: orgA }, create: { organizationId: orgA, ...next }, update: next })
    expect(await prisma.organizationLogo.count({ where: { organizationId: orgA } })).toBe(1)
    const stale = await get(orgA, logoVersion(first.hash))
    expect(stale.headers.get("Cache-Control")).toBe("public, max-age=3600, must-revalidate")
    expect(stale.headers.get("ETag")).toBe(`"${second.hash}"`)
  })

  it("never lets another organization's scoped client read, replace or delete it", async () => {
    const dbB = getOrgClient(orgB)
    expect(await dbB.organizationLogo.findUnique({ where: { organizationId: orgA } })).toBeNull()
    expect(await dbB.organizationLogo.findMany({})).toEqual([])
    const logo = await processed("#000000")
    const fields = { data: new Uint8Array(logo.data), mimeType: logo.mimeType, width: logo.width, height: logo.height, hash: logo.hash }
    await expect(dbB.organizationLogo.upsert({ where: { organizationId: orgA }, create: { organizationId: orgA, ...fields }, update: fields })).rejects.toBeInstanceOf(TenantAccessError)
    expect((await dbB.organizationLogo.deleteMany({ where: { organizationId: orgA } })).count).toBe(0)
    expect(await prisma.organizationLogo.count({ where: { organizationId: orgA } })).toBe(1)
    // Org B has no logo of its own.
    expect((await get(orgB)).status).toBe(404)
  })

  it("serves a pending space's logo only to its own admins, uncached (#810)", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { publicationApprovedAt: null } })
    session.current = null
    expect((await get(orgA)).status).toBe(404)
    session.current = { user: { role: "admin", organizationId: orgB } }
    expect((await get(orgA)).status).toBe(404)
    session.current = { user: { role: "admin", organizationId: orgA } }
    const own = await get(orgA)
    expect(own.status).toBe(200)
    expect(own.headers.get("Cache-Control")).toBe("private, no-store")
    session.current = null
  })

  it("is no longer served once the organization is deactivated, and is purged with it", async () => {
    await prisma.organization.update({ where: { id: orgA }, data: { active: false } })
    expect((await get(orgA)).status).toBe(404)

    await prisma.organization.deleteMany({ where: { id: orgA } })
    expect(await prisma.organizationLogo.count({ where: { organizationId: orgA } })).toBe(0)
  })
})
