// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Permanent member deletion (#667) against a real Postgres: the unit tests
 * (src/lib/__tests__/member-deletion.test.ts) cover the pure rule; this checks what only a real
 * database can prove — cascading relations, the row lock's defence against a concurrent sign-up,
 * and that a merged tombstone is refused — the same spirit as member-merge.int.test.ts (#600).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { runMemberDeletion, MemberDeletionConflictError } from "@/lib/member-deletion-transaction"
import { registrationToken } from "@/lib/token-vault"

const url = process.env.DATABASE_URL
const tag = `int-del-${Date.now()}`
const ADMIN_ACTOR = { type: "admin" as const, id: "adm-test" }

describe.skipIf(!url)("member deletion transaction (#667)", () => {
  let orgId = ""
  let eventId = ""
  let shiftId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org deletion", slug: `${tag}-org` } })
    orgId = org.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01") },
    })
    eventId = event.id
    const shift = await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", capacity: 5 } })
    shiftId = shift.id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  async function makeVolunteer(suffix: string, over: { active?: boolean; mergedIntoId?: string } = {}) {
    return prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Alice", lastName: `M-${suffix}`, email: `${tag}-${suffix}@x.ch`, active: over.active ?? false, mergedIntoId: over.mergedIntoId ?? null } })
  }

  it("deletes an inactive member with no registration, cancels its pending outbox rows, and logs member.deleted with the id only", async () => {
    const { sealPayload } = await import("@/lib/notifications/outbox")
    const member = await makeVolunteer("eligible")
    const invite = await prisma.memberInvite.create({ data: { eventId, volunteerId: member.id, tokenHash: `${tag}-inv-hash`, tokenEnc: null } })
    const push = await prisma.pushSubscription.create({ data: { volunteerId: member.id, endpoint: `${tag}-endpoint`, auth: "a", p256dh: "p" } })
    const outcome = await prisma.deliveryOutcome.create({ data: { organizationId: orgId, volunteerId: member.id, kind: "signup", outcome: "accepted_by_relay" } })
    const outbox = await prisma.notificationOutbox.create({
      data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "reminder_j2", recipient: { email: member.email! }, volunteerId: member.id, data: {} }) },
    })

    const db = getOrgClient(orgId)
    const result = await runMemberDeletion(db, orgId, ADMIN_ACTOR, member.id)
    expect(result.outboxCancelled).toBe(1)

    expect(await prisma.volunteer.findUnique({ where: { id: member.id } })).toBeNull()
    // Cascaded away with the Volunteer row.
    expect(await prisma.memberInvite.findUnique({ where: { id: invite.id } })).toBeNull()
    expect(await prisma.pushSubscription.findUnique({ where: { id: push.id } })).toBeNull()
    expect(await prisma.deliveryOutcome.findUnique({ where: { id: outcome.id } })).toBeNull()

    const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outbox.id } })
    expect(row.status).toBe("failed")

    const log = await prisma.orgLog.findFirstOrThrow({ where: { organizationId: orgId, action: "member.deleted", entityId: member.id } })
    expect(log.changes).toBeNull()

    await prisma.notificationOutbox.deleteMany({ where: { id: outbox.id } })
  })

  it("refuses to delete an active member, touching nothing", async () => {
    const member = await makeVolunteer("active", { active: true })
    const db = getOrgClient(orgId)
    await expect(runMemberDeletion(db, orgId, ADMIN_ACTOR, member.id)).rejects.toBeInstanceOf(MemberDeletionConflictError)
    expect(await prisma.volunteer.findUnique({ where: { id: member.id } })).not.toBeNull()
  })

  it("refuses to delete a member with a registration, whatever its status, touching nothing", async () => {
    const member = await makeVolunteer("withreg")
    await prisma.registration.create({
      data: { eventId, shiftId, volunteerId: member.id, status: "cancelled", ...registrationToken.data(`${tag}-tok-withreg`) },
    })
    const db = getOrgClient(orgId)
    await expect(runMemberDeletion(db, orgId, ADMIN_ACTOR, member.id)).rejects.toBeInstanceOf(MemberDeletionConflictError)
    expect(await prisma.volunteer.findUnique({ where: { id: member.id } })).not.toBeNull()
  })

  it("refuses to delete a merged tombstone even though it has no registration of its own", async () => {
    const keep = await makeVolunteer("keep-for-tombstone")
    const tombstone = await makeVolunteer("tombstone", { mergedIntoId: keep.id })
    const db = getOrgClient(orgId)
    await expect(runMemberDeletion(db, orgId, ADMIN_ACTOR, tombstone.id)).rejects.toBeInstanceOf(MemberDeletionConflictError)
    expect(await prisma.volunteer.findUnique({ where: { id: tombstone.id } })).not.toBeNull()
  })

  it("refuses to delete across organizations", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org deletion B", slug: `${tag}-org-b` } })
    const member = await prisma.volunteer.create({ data: { organizationId: orgB.id, firstName: "Bob", lastName: "B", active: false } })
    const db = getOrgClient(orgId) // org-A's client
    await expect(runMemberDeletion(db, orgId, ADMIN_ACTOR, member.id)).rejects.toBeInstanceOf(MemberDeletionConflictError)
    expect(await prisma.volunteer.findUnique({ where: { id: member.id } })).not.toBeNull()
  })

  it("a concurrent sign-up racing the deletion is never silently lost: either it lands and the deletion is refused, or it fails because the member is already gone", async () => {
    const member = await makeVolunteer("race")
    const db = getOrgClient(orgId)

    const results = await Promise.allSettled([
      runMemberDeletion(db, orgId, ADMIN_ACTOR, member.id),
      prisma.registration.create({
        data: { eventId, shiftId, volunteerId: member.id, status: "active", ...registrationToken.data(`${tag}-tok-race`) },
      }),
    ])
    const [delResult, regResult] = results

    if (delResult.status === "fulfilled") {
      // The deletion won the race: the sign-up's insert must have failed (the member it was
      // inserting against no longer exists) — never a registration left orphaned on a deleted member.
      expect(regResult.status).toBe("rejected")
      expect(await prisma.volunteer.findUnique({ where: { id: member.id } })).toBeNull()
    } else {
      // The sign-up won the race: the deletion's in-transaction re-check must have seen it and
      // refused — the member and its brand-new registration both still exist.
      expect(delResult.reason).toBeInstanceOf(MemberDeletionConflictError)
      expect(regResult.status).toBe("fulfilled")
      expect(await prisma.volunteer.findUnique({ where: { id: member.id } })).not.toBeNull()
      expect(await prisma.registration.count({ where: { volunteerId: member.id } })).toBe(1)
    }
  })
})
