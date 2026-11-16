import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"

/**
 * The last-owner rule (#469) under concurrency, against a real Postgres: two owners demoting or
 * removing each other at the same moment must leave the organisation with one active owner, the
 * second change refused. Each change locks the organisation's row before it counts the owners
 * (src/lib/admin-team-changes.ts).
 */

import { prisma } from "@/lib/prisma"
import { changeAdminRole, removeOrgAdmin } from "@/lib/admin-team-changes"
import { ORGANIZER_ROLE, OWNER_ROLE } from "@/lib/permissions"

const url = process.env.DATABASE_URL
const tag = `int-lastowner-${Date.now()}`

describe.skipIf(!url)("last active owner under concurrent changes (#469)", () => {
  let orgId = ""
  let otherOrgId = ""
  let ownerA = { id: "", email: "" }
  let ownerB = { id: "", email: "" }

  const activeOwners = () => prisma.adminUser.count({ where: { organizationId: orgId, isActive: true, role: OWNER_ROLE } })

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: "Org owners", slug: `${tag}-a` } })).id
    otherOrgId = (await prisma.organization.create({ data: { name: "Org other", slug: `${tag}-b` } })).id
  })

  beforeEach(async () => {
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    const mk = async (who: string, organizationId = orgId) => prisma.adminUser.create({
      data: { organizationId, email: `${tag}-${who}@example.org`, name: who, passwordHash: "x", role: OWNER_ROLE, isActive: true },
      select: { id: true, email: true },
    })
    ownerA = await mk("nadia.keller")
    ownerB = await mk("luca.bernasconi")
    await mk("sophie.marchand", otherOrgId)
  })

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
  })

  it("two owners demoting each other at once: one change passes, the other is refused", async () => {
    for (let round = 0; round < 5; round++) {
      await prisma.adminUser.updateMany({ where: { id: { in: [ownerA.id, ownerB.id] } }, data: { role: OWNER_ROLE } })
      const results = await Promise.all([
        changeAdminRole(orgId, ownerB.id, ORGANIZER_ROLE),
        changeAdminRole(orgId, ownerA.id, ORGANIZER_ROLE),
      ])
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(results.filter((r) => !r.ok && r.status === 400)).toHaveLength(1)
      expect(await activeOwners()).toBe(1)
    }
  })

  it("two owners removing each other at once: one removal passes, the other is refused", async () => {
    const results = await Promise.all([
      removeOrgAdmin(orgId, ownerB.id, ownerA.email),
      removeOrgAdmin(orgId, ownerA.id, ownerB.email),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await activeOwners()).toBe(1)
  })

  it("a demotion and a removal crossing each other leave one active owner", async () => {
    const results = await Promise.all([
      changeAdminRole(orgId, ownerB.id, ORGANIZER_ROLE),
      removeOrgAdmin(orgId, ownerA.id, ownerB.email),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await activeOwners()).toBe(1)
  })

  it("never reaches an admin of another organisation", async () => {
    const foreign = await prisma.adminUser.findFirstOrThrow({ where: { organizationId: otherOrgId }, select: { id: true } })
    expect(await changeAdminRole(orgId, foreign.id, ORGANIZER_ROLE)).toMatchObject({ ok: false, status: 404 })
    expect(await removeOrgAdmin(orgId, foreign.id, ownerA.email)).toMatchObject({ ok: false, status: 404 })
    expect(await prisma.adminUser.findUnique({ where: { id: foreign.id }, select: { role: true } })).toEqual({ role: OWNER_ROLE })
  })
})
