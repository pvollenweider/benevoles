// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Purge of front-desk accounts (#1142) against a real Postgres: the unit tests cover the pure
 * decision and the purge's conditions with doubles; this proves what only a database can — the
 * grant cascades away with its account, a front desk whose access ended 10 days ago and an
 * organiser are untouched, and the organisation log records the deletion without the person's
 * name or address.
 *
 * The suite deletes everything it creates (accounts, organisation, events, logs) in afterAll.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { purgeDueFrontDeskAccounts } from "@/lib/front-desk-purge"
import { DAY_MS } from "@/lib/retention"

const url = process.env.DATABASE_URL
const tag = `int-fd-purge-${Date.now()}`
const NOW = new Date("2027-09-20T12:00:00Z")
const day = (daysAgo: number) => new Date(new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString().slice(0, 10) + "T00:00:00Z")

describe.skipIf(!url)("front-desk account purge (#1142)", () => {
  let orgId = ""
  let oldEventId = ""
  let futureEventId = ""
  let dueAccountId = ""
  let keptAccountId = ""
  let organizerId = ""

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag } })).id
    const oldEvent = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete-ancienne", title: "Fête du village", startDate: day(101), endDate: day(100), publicStatus: "published" },
    })
    oldEventId = oldEvent.id
    const futureEvent = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete-a-venir", title: "Fête à venir", startDate: day(-10), endDate: day(-9), publicStatus: "published" },
    })
    futureEventId = futureEvent.id

    const due = await prisma.adminUser.create({
      data: { organizationId: orgId, email: `${tag}-due@example.org`, name: "Colette Due", passwordHash: "x", role: "front_desk", isActive: true, receiveProductUpdates: false },
    })
    dueAccountId = due.id
    await prisma.adminEventAccess.create({ data: { adminUserId: due.id, eventId: oldEventId, organizationId: orgId } })

    const kept = await prisma.adminUser.create({
      data: { organizationId: orgId, email: `${tag}-kept@example.org`, name: "Sacha Kept", passwordHash: "x", role: "front_desk", isActive: true, receiveProductUpdates: false },
    })
    keptAccountId = kept.id
    // Its event is still ahead, so its access ended with the revocation 10 days before NOW.
    await prisma.adminEventAccess.create({ data: { adminUserId: kept.id, eventId: futureEventId, organizationId: orgId, revokedAt: new Date(NOW.getTime() - 10 * DAY_MS) } })

    organizerId = (await prisma.adminUser.create({
      data: { organizationId: orgId, email: `${tag}-owner@example.org`, name: "Organisateur Intact", passwordHash: "x", role: "organizer", isActive: true },
    })).id
  })

  afterAll(async () => {
    // No row left behind: the accounts first (their grants cascade), then the organisation and its
    // events, which cascades to its logs.
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.organization.deleteMany({ where: { slug: tag } })
    await prisma.$disconnect()
  })

  it("deletes only the account whose access ended more than 90 days ago, with its grant and a log entry without its identity", async () => {
    await expect(purgeDueFrontDeskAccounts(NOW)).resolves.toEqual({ deleted: 1 })

    // The due account and its grant are gone (onDelete: Cascade).
    expect(await prisma.adminUser.findUnique({ where: { id: dueAccountId } })).toBeNull()
    expect(await prisma.adminEventAccess.count({ where: { adminUserId: dueAccountId } })).toBe(0)

    // The access that ended 10 days ago and the organiser are untouched, with their grants.
    expect(await prisma.adminUser.findUnique({ where: { id: keptAccountId } })).not.toBeNull()
    expect(await prisma.adminEventAccess.count({ where: { adminUserId: keptAccountId } })).toBe(1)
    expect(await prisma.adminUser.findUnique({ where: { id: organizerId } })).toMatchObject({ role: "organizer", email: `${tag}-owner@example.org` })

    // One system entry, saying a front-desk account and the event's title, never the person.
    const log = await prisma.orgLog.findFirstOrThrow({ where: { organizationId: orgId, action: "frontdesk.account_purged" } })
    expect(log).toMatchObject({ actorType: "system", actorId: null, entityType: "AdminUser", entityId: dueAccountId })
    expect(log.changes).toEqual({ eventTitle: { from: null, to: "Fête du village" } })
    const serialized = JSON.stringify(log)
    expect(serialized).not.toContain("Colette Due")
    expect(serialized).not.toContain(`${tag}-due@example.org`)
  })
})
