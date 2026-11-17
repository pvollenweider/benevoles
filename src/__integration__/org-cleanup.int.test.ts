// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The nightly cleanup's deletion of organisations against a real Postgres: an organisation
 * reactivated between the cleanup's read and its delete survives, with its administrators, while
 * the one still due goes with its own.
 *
 * The suite deletes everything it creates in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { deleteExpiredDeactivatedOrgs } from "@/lib/org-cleanup"
import { daysAgo, RETENTION_DAYS } from "@/lib/retention"

const url = process.env.DATABASE_URL
const tag = `int-org-cleanup-${Date.now()}`

describe.skipIf(!url)("nightly deletion of expired organisations", () => {
  let dueId = ""
  let reactivatedId = ""

  beforeAll(async () => {
    dueId = (await prisma.organization.create({ data: { name: `Due ${tag}`, slug: `${tag}-due`, active: false } })).id
    reactivatedId = (await prisma.organization.create({ data: { name: `Back ${tag}`, slug: `${tag}-back`, active: false } })).id
    for (const [id, slug] of [[dueId, "due"], [reactivatedId, "back"]]) {
      await prisma.adminUser.create({ data: { email: `${slug}-${tag}@example.org`, name: slug, passwordHash: "x", organizationId: id, role: "admin", isActive: true } })
    }
    // Both deactivated long enough ago: updatedAt is set by Prisma, so backdate it directly.
    await prisma.$executeRaw`UPDATE "Organization" SET "updatedAt" = NOW() - INTERVAL '400 days' WHERE id IN (${dueId}, ${reactivatedId})`
  })

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: { endsWith: `-${tag}@example.org` } } })
    await prisma.organization.deleteMany({ where: { id: { in: [dueId, reactivatedId] } } })
    await prisma.$disconnect()
  })

  it("spares the organisation reactivated between the read and the delete, and its administrators", async () => {
    const cutoff = daysAgo(new Date(), RETENTION_DAYS.deactivatedOrganization)
    const out = await prisma.$transaction(async (tx) => {
      // The reactivation commits after the cleanup read its list and before it deletes.
      const racing = new Proxy(tx, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver)
          if (prop !== "organization") return value
          return new Proxy(value, {
            get(org, method) {
              if (method !== "deleteMany") return Reflect.get(org, method)
              return async (args: never) => {
                await prisma.organization.update({ where: { id: reactivatedId }, data: { active: true } })
                return org.deleteMany(args)
              }
            },
          })
        },
      })
      return deleteExpiredDeactivatedOrgs(racing, cutoff)
    })
    expect(await prisma.organization.findUnique({ where: { id: reactivatedId } })).toMatchObject({ active: true })
    expect(await prisma.adminUser.count({ where: { email: `back-${tag}@example.org` } })).toBe(1)
    expect(await prisma.organization.findUnique({ where: { id: dueId } })).toBeNull()
    expect(await prisma.adminUser.count({ where: { email: `due-${tag}@example.org` } })).toBe(0)
    // Other expired organisations of a shared test database may go too: ours is one of them.
    expect(out.deletedOrgs.count).toBeGreaterThanOrEqual(1)
  })
})
