import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Member merge (#600) against a real Postgres: the unit tests (src/lib/__tests__/member-merge.test.ts)
 * cover the pure planner; this checks what only a real database can prove — the transaction's
 * atomicity, the partial unique index on live registrations, row locking under concurrency, and
 * that a regenerated token really stops resolving the old one.
 */

vi.mock("next/server", () => ({ after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn().mockResolvedValue({ ok: true }) }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { runMemberMerge, MergeConflictError } from "@/lib/member-merge-transaction"
import { UnresolvedConflictsError } from "@/lib/member-merge"
import { registrationToken } from "@/lib/token-vault"
import { hashToken } from "@/lib/token-hash"

const url = process.env.DATABASE_URL
const tag = `int-merge-${Date.now()}`
const ADMIN_ACTOR = { type: "admin" as const, id: "adm-test" }

describe.skipIf(!url)("member merge transaction (#600)", () => {
  let orgId = ""
  let eventId = ""
  let shift1 = ""
  let shift2 = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org merge", slug: `${tag}-org` } })
    orgId = org.id
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-01") },
    })
    eventId = event.id
    const s1 = await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", capacity: 5 } })
    const s2 = await prisma.shift.create({ data: { eventId, roleName: "Accueil", label: "Accueil", date: new Date("2030-06-01"), startTime: "14:00", endTime: "16:00", capacity: 5 } })
    shift1 = s1.id
    shift2 = s2.id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  async function makeVolunteer(suffix: string, email: string | null) {
    return prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Alice", lastName: `M-${suffix}`, email } })
  }

  it("moves every relation of the inventory, cancels the losing same-shift registration, and regenerates tokens", async () => {
    const keep = await makeVolunteer("keep", `${tag}-keep@x.ch`)
    const absorb = await makeVolunteer("absorb", `${tag}-wrong@x.ch`)

    // Same shift on both: keep's is "waiting", absorb's is "active" — active should win.
    const regKeepSameShift = await prisma.registration.create({
      data: { eventId, shiftId: shift1, volunteerId: keep.id, status: "waiting", ...registrationToken.data(`${tag}-tok-keep-same`) },
    })
    const regAbsorbSameShift = await prisma.registration.create({
      data: { eventId, shiftId: shift1, volunteerId: absorb.id, status: "active", ...registrationToken.data(`${tag}-tok-absorb-same`) },
    })
    // Absorb-only registration on another shift, to be reassigned untouched.
    const oldToken = `${tag}-tok-absorb-other`
    const regAbsorbOther = await prisma.registration.create({
      data: { eventId, shiftId: shift2, volunteerId: absorb.id, status: "active", ...registrationToken.data(oldToken) },
    })
    const pushSub = await prisma.pushSubscription.create({ data: { volunteerId: absorb.id, endpoint: `${tag}-endpoint`, auth: "a", p256dh: "p" } })

    const db = getOrgClient(orgId)
    const result = await runMemberMerge(db, orgId, ADMIN_ACTOR, keep.id, absorb.id, {})

    expect(result.plan.registrationsToCancel).toEqual([{ id: regKeepSameShift.id, shiftLabel: "Bar" }])
    expect(result.plan.registrationsToReassign.sort()).toEqual([regAbsorbOther.id, regAbsorbSameShift.id].sort())

    const cancelled = await prisma.registration.findUniqueOrThrow({ where: { id: regKeepSameShift.id } })
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.volunteerId).toBe(keep.id)

    const winner = await prisma.registration.findUniqueOrThrow({ where: { id: regAbsorbSameShift.id } })
    expect(winner.volunteerId).toBe(keep.id)
    expect(winner.status).toBe("active")

    const moved = await prisma.registration.findUniqueOrThrow({ where: { id: regAbsorbOther.id } })
    expect(moved.volunteerId).toBe(keep.id)
    // The old token must no longer resolve: its hash was rotated.
    expect(moved.editTokenHash).not.toBe(hashToken(oldToken))
    expect(await prisma.registration.findFirst({ where: { editTokenHash: hashToken(oldToken) } })).toBeNull()

    // Push subscriptions are dropped, never moved.
    expect(await prisma.pushSubscription.findUnique({ where: { id: pushSub.id } })).toBeNull()

    // The absorbed record is a tombstone with no personal data left.
    const tombstone = await prisma.volunteer.findUniqueOrThrow({ where: { id: absorb.id } })
    expect(tombstone).toMatchObject({ firstName: "", lastName: "", email: null, phone: null, notes: null, active: false, mergedIntoId: keep.id })
    expect(tombstone.mergedAt).toBeInstanceOf(Date)

    // No relation remains on the absorbed record (the invariant the transaction itself asserts).
    expect(await prisma.registration.count({ where: { volunteerId: absorb.id } })).toBe(0)
    expect(await prisma.pushSubscription.count({ where: { volunteerId: absorb.id } })).toBe(0)

    // Audited with ids and counts only — no names, no email.
    const log = await prisma.orgLog.findFirstOrThrow({ where: { organizationId: orgId, action: "member.merged", entityId: keep.id } })
    const changes = JSON.stringify(log.changes)
    expect(changes).not.toContain("Alice")
    expect(changes).not.toContain(absorb.email ?? "")
    expect(log.changes).toMatchObject({ absorbedId: { from: absorb.id, to: null } })

    // The losing registration's cancellation is itself logged.
    const cancelLog = await prisma.eventLog.findFirstOrThrow({ where: { eventId, entityId: regKeepSameShift.id, action: "registration.cancelled" } })
    expect(cancelLog).toBeTruthy()
  })

  it("keeps the absorbed record's address on the kept member (regression: unique email index refused the merge in production)", async () => {
    const keep = await makeVolunteer("keep-wrong", `${tag}-typo@x.ch`)
    const absorb = await makeVolunteer("absorb-right", `${tag}-right@x.ch`)

    const db = getOrgClient(orgId)
    await runMemberMerge(db, orgId, ADMIN_ACTOR, keep.id, absorb.id, { fields: { email: "absorb" } })

    expect((await prisma.volunteer.findUniqueOrThrow({ where: { id: keep.id } })).email).toBe(`${tag}-right@x.ch`)
    const tombstone = await prisma.volunteer.findUniqueOrThrow({ where: { id: absorb.id } })
    expect(tombstone).toMatchObject({ email: null, mergedIntoId: keep.id })
  })

  it("reassigns a DeliveryOutcome only when its addressHash matches the kept member's final address, leaving the rest on the tombstone", async () => {
    const keep = await makeVolunteer("keep2", `${tag}-keep2@x.ch`)
    const absorb = await makeVolunteer("absorb2", `${tag}-wrong2@x.ch`)
    const { addressHash } = await import("@/lib/notifications/smtp-outcome")
    const { env } = await import("@/lib/env")
    const keepHash = addressHash(keep.email!, env.AUTH_SECRET)
    const matching = await prisma.deliveryOutcome.create({ data: { organizationId: orgId, volunteerId: absorb.id, kind: "signup", outcome: "accepted_by_relay", addressHash: keepHash } })
    const other = await prisma.deliveryOutcome.create({ data: { organizationId: orgId, volunteerId: absorb.id, kind: "signup", outcome: "rejected_permanent", addressHash: "unrelated-hash" } })

    const db = getOrgClient(orgId)
    const result = await runMemberMerge(db, orgId, ADMIN_ACTOR, keep.id, absorb.id, {})
    expect(result.plan.deliveryOutcomeIdsToReassign).toEqual([matching.id])

    expect((await prisma.deliveryOutcome.findUniqueOrThrow({ where: { id: matching.id } })).volunteerId).toBe(keep.id)
    // Left attached to the tombstone — removed later by the retention purge (cascade on delete),
    // not by the merge itself.
    expect((await prisma.deliveryOutcome.findUniqueOrThrow({ where: { id: other.id } })).volunteerId).toBe(absorb.id)
  })

  it("cancels pending outbox rows addressed to the absorbed record, by volunteerId or by email, leaving unrelated and in-flight rows alone", async () => {
    const { sealPayload } = await import("@/lib/notifications/outbox")
    const { MERGED_MEMBER_CANCEL_REASON } = await import("@/lib/outbox-merge-cancel")
    const keep = await makeVolunteer("keep6", `${tag}-keep6@x.ch`)
    const absorb = await makeVolunteer("absorb6", `${tag}-wrong6@x.ch`)
    const other = await makeVolunteer("other6", `${tag}-other6@x.ch`)

    // Matched by the #598 volunteerId carried in the payload.
    const byVolunteerId = await prisma.notificationOutbox.create({
      data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "reminder_j2", recipient: { email: absorb.email! }, volunteerId: absorb.id, data: {} }) },
    })
    // No volunteerId in the payload: falls back to a normalized email match.
    const byEmail = await prisma.notificationOutbox.create({
      data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "reminder_j1", recipient: { email: ` ${absorb.email!.toUpperCase()} ` }, data: {} }) },
    })
    // A different member: must not be touched.
    const unrelated = await prisma.notificationOutbox.create({
      data: { organizationId: orgId, status: "pending", payload: sealPayload({ kind: "reminder_j2", recipient: { email: other.email! }, volunteerId: other.id, data: {} }) },
    })
    // Addressed to the absorbed member but already claimed by a delivery in flight: must not be cancelled.
    const sending = await prisma.notificationOutbox.create({
      data: { organizationId: orgId, status: "sending", claimedAt: new Date(), payload: sealPayload({ kind: "reminder_dd", recipient: { email: absorb.email! }, volunteerId: absorb.id, data: {} }) },
    })

    const db = getOrgClient(orgId)
    const result = await runMemberMerge(db, orgId, ADMIN_ACTOR, keep.id, absorb.id, {})
    expect(result.outboxCancelled).toBe(2)

    for (const id of [byVolunteerId.id, byEmail.id]) {
      const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } })
      expect(row.status).toBe("failed")
      expect(row.lastError).toBe(MERGED_MEMBER_CANCEL_REASON)
    }
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: unrelated.id } })).status).toBe("pending")
    expect((await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: sending.id } })).status).toBe("sending")

    await prisma.notificationOutbox.deleteMany({ where: { id: { in: [byVolunteerId.id, byEmail.id, unrelated.id, sending.id] } } })
  })

  it("refuses to merge across organizations", async () => {
    const orgB = await prisma.organization.create({ data: { name: "Org B merge", slug: `${tag}-org-b` } })
    const keep = await makeVolunteer("keep3", `${tag}-keep3@x.ch`)
    const otherOrgMember = await prisma.volunteer.create({ data: { organizationId: orgB.id, firstName: "Bob", lastName: "B", email: `${tag}-bob@x.ch` } })

    const db = getOrgClient(orgId)
    await expect(runMemberMerge(db, orgId, ADMIN_ACTOR, keep.id, otherOrgMember.id, {})).rejects.toMatchObject({ status: 404 })
  })

  it("fails cleanly with an unresolved conflict and writes nothing", async () => {
    const keep = await makeVolunteer("keep4", `${tag}-keep4@x.ch`)
    const absorb = await makeVolunteer("absorb4", `${tag}-wrong4@x.ch`)
    const question = await prisma.eventQuestion.create({ data: { eventId, label: "Allergies ?", type: "yesno" } })
    await prisma.questionAnswer.create({ data: { questionId: question.id, eventId, volunteerId: keep.id, values: ["oui"] } })
    await prisma.questionAnswer.create({ data: { questionId: question.id, eventId, volunteerId: absorb.id, values: ["non"] } })

    const db = getOrgClient(orgId)
    await expect(runMemberMerge(db, orgId, ADMIN_ACTOR, keep.id, absorb.id, {})).rejects.toBeInstanceOf(UnresolvedConflictsError)

    // Nothing moved, nothing logged: the transaction never committed.
    const stillKeep = await prisma.volunteer.findUniqueOrThrow({ where: { id: keep.id } })
    expect(stillKeep.firstName).toBe("Alice")
    const stillAbsorb = await prisma.volunteer.findUniqueOrThrow({ where: { id: absorb.id } })
    expect(stillAbsorb.active).toBe(true)
    expect(stillAbsorb.mergedIntoId).toBeNull()
    expect(await prisma.orgLog.count({ where: { organizationId: orgId, action: "member.merged", entityId: keep.id } })).toBe(0)
  })

  it("under concurrent double confirmation, one merge commits and the other gets a clean conflict", async () => {
    const keepA = await makeVolunteer("keep5a", `${tag}-keep5a@x.ch`)
    const keepB = await makeVolunteer("keep5b", `${tag}-keep5b@x.ch`)
    const absorb = await makeVolunteer("absorb5", `${tag}-wrong5@x.ch`)

    const db = getOrgClient(orgId)
    const results = await Promise.allSettled([
      runMemberMerge(db, orgId, ADMIN_ACTOR, keepA.id, absorb.id, {}),
      runMemberMerge(db, orgId, ADMIN_ACTOR, keepB.id, absorb.id, {}),
    ])
    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r) => r.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(MergeConflictError)

    const tombstone = await prisma.volunteer.findUniqueOrThrow({ where: { id: absorb.id } })
    expect([keepA.id, keepB.id]).toContain(tombstone.mergedIntoId)
  })
})
