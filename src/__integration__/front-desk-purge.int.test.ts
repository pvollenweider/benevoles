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
import { frontDeskInviteDedupeKey } from "@/lib/front-desk-access"
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
  let dueOutboxKey = ""
  let keptOutboxKey = ""
  let otherKindOutboxKey = ""

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

    // Queued invitations: the purged account's row must go with it, another account's row of the
    // same kind and another kind must stay.
    dueOutboxKey = frontDeskInviteDedupeKey(orgId, dueAccountId, "due-setup-token-hash")
    keptOutboxKey = frontDeskInviteDedupeKey(orgId, keptAccountId, "kept-setup-token-hash")
    otherKindOutboxKey = `admin_invite:${orgId}:${dueAccountId}:other`
    await prisma.notificationOutbox.createMany({
      data: [
        { organizationId: orgId, dedupeKey: dueOutboxKey, payload: { kind: "front_desk_invite" } },
        { organizationId: orgId, dedupeKey: keptOutboxKey, payload: { kind: "front_desk_invite" } },
        { organizationId: orgId, dedupeKey: otherKindOutboxKey, payload: { kind: "admin_invite" } },
      ],
    })
  })

  afterAll(async () => {
    // No row left behind: the accounts first (their grants cascade), then the organisation and its
    // events, which cascades to its logs.
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.adminUser.deleteMany({ where: { email: { startsWith: tag } } })
    await prisma.organization.deleteMany({ where: { slug: tag } })
    await prisma.$disconnect()
  })

  it("deletes only the account whose access ended more than 90 days ago, with its grant, its queued invitation and a log entry without its identity", async () => {
    // Scoped to this fixture's organisation: a shared database must not have unrelated accounts
    // purged, and the count must not depend on another fixture.
    await expect(purgeDueFrontDeskAccounts(NOW, undefined, [orgId])).resolves.toEqual({ deleted: 1, failed: 0 })

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

    // The queued invitation of the purged account is gone; another account's row of the same kind,
    // and another kind, stay.
    expect(await prisma.notificationOutbox.findUnique({ where: { dedupeKey: dueOutboxKey } })).toBeNull()
    expect(await prisma.notificationOutbox.findUnique({ where: { dedupeKey: keptOutboxKey } })).not.toBeNull()
    expect(await prisma.notificationOutbox.findUnique({ where: { dedupeKey: otherKindOutboxKey } })).not.toBeNull()
  })

  it("deletes nothing on a second run", async () => {
    await expect(purgeDueFrontDeskAccounts(NOW, undefined, [orgId])).resolves.toEqual({ deleted: 0, failed: 0 })
    expect(await prisma.notificationOutbox.findUnique({ where: { dedupeKey: keptOutboxKey } })).not.toBeNull()
    expect(await prisma.notificationOutbox.findUnique({ where: { dedupeKey: otherKindOutboxKey } })).not.toBeNull()
  })
})
