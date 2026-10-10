import { describe, it, expect, afterAll, vi } from "vitest"

/**
 * #813 phase 2 against a real Postgres: a batch anonymises an event ended more than 3 years ago
 * (registrations moved to one anonymous record per member, comments and phones gone, answers,
 * invites and sector leaders deleted, the member's own log entries re-pointed), leaves the recent
 * event and the member records alone, does not count the anonymous records as new members, and
 * does nothing the second time. The notice is enqueued once per administrator.
 */

// The notice delivers after the response (`after`), which needs a request: nothing to deliver here.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: () => {} }))

import { prisma } from "@/lib/prisma"
import { linkToken, registrationToken } from "@/lib/token-vault"
import { observePastEvents } from "@/lib/past-event-retention-data"
import { loadPastEventOrganizations, runPastEventBatch, sendPastEventNotice } from "@/lib/past-event-anonymisation"
import { ERASED_FIRST_NAME } from "@/lib/member-erasure"

const url = process.env.DATABASE_URL
const tag = `int-anon-${Date.now()}`
const NOW = new Date("2026-10-10T02:00:00Z")

describe.skipIf(!url)("past events anonymisation on Postgres (#813)", () => {
  let orgId = ""

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.registration.deleteMany({ where: { event: { organizationId: orgId } } })
      await prisma.adminUser.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  it("anonymises the old event only, once", async () => {
    orgId = (await prisma.organization.create({ data: { name: `Comité ${tag}`, slug: tag } })).id
    const event = (slug: string, day: string) => prisma.event.create({ data: { organizationId: orgId, slug, title: slug, startDate: new Date(day), endDate: new Date(day), publicStatus: "published" } })
    const old = await event("fete-2022", "2022-06-01")
    const recent = await event("fete-2026", "2026-06-01")
    const shift = (eventId: string, day: string) => prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date(day), startTime: "18:00", endTime: "20:00", capacity: 5 } })
    const oldShift = await shift(old.id, "2022-06-01")
    const recentShift = await shift(recent.id, "2026-06-01")
    const member = (firstName: string, n: string) => prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName: "Martin", email: `${tag}-${n}@example.org`, phone: "+41 79 000 00 00" } })
    const alice = await member("Alice", "a")
    const bruno = await member("Bruno", "b")
    const erased = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: ERASED_FIRST_NAME, lastName: "effacé", erasedAt: new Date("2025-01-01") } })
    const register = (eventId: string, shiftId: string, volunteerId: string, n: string) =>
      prisma.registration.create({ data: { eventId, shiftId, volunteerId, status: "active", comment: "Je viens avec ma fille", phone: "+41 79 111 11 11", checkedInAt: new Date("2022-06-01T16:00:00Z"), ...registrationToken.data(`${tag}-${n}`) } })
    const oldA = await register(old.id, oldShift.id, alice.id, "1")
    const oldB = await register(old.id, oldShift.id, bruno.id, "2")
    const oldErased = await register(old.id, oldShift.id, erased.id, "3")
    const recentB = await register(recent.id, recentShift.id, bruno.id, "4")
    const question = await prisma.eventQuestion.create({ data: { eventId: old.id, label: "Taille de t-shirt", type: "text" } })
    await prisma.questionAnswer.create({ data: { questionId: question.id, eventId: old.id, volunteerId: alice.id, values: ["M"] } })
    await prisma.memberInvite.create({ data: { eventId: old.id, volunteerId: alice.id, ...linkToken.data(`${tag}-invite`) } })
    await prisma.sectorLeader.create({ data: { eventId: old.id, roleName: "Bar", name: "Chef Bar", email: `${tag}-chef@example.org`, ...linkToken.data(`${tag}-leader`) } })
    await prisma.eventLog.create({ data: { eventId: old.id, actorType: "volunteer", actorId: alice.id, action: "registration.cancelled", entityType: "Registration", entityId: oldA.id } })
    const membersBefore = await prisma.platformCounter.findUnique({ where: { metric: "members" } })

    expect((await loadPastEventOrganizations(NOW)).find((o) => o.id === orgId)).toMatchObject({ concernedEvents: 1, pastEventNoticeAt: null })

    const counts = await runPastEventBatch(orgId, NOW)
    expect(counts).toEqual({ events: 1, registrations: 2, anonymousRecords: 2, answers: 1, invites: 1, sectorLeaders: 1 })

    const regs = await prisma.registration.findMany({ where: { id: { in: [oldA.id, oldB.id, oldErased.id, recentB.id] } }, include: { volunteer: true } })
    const byId = new Map(regs.map((r) => [r.id, r]))
    const a = byId.get(oldA.id)!
    const b = byId.get(oldB.id)!
    // One anonymous record per member, linked to neither, with no identity.
    expect(a.volunteerId).not.toBe(alice.id)
    expect(b.volunteerId).not.toBe(bruno.id)
    expect(a.volunteerId).not.toBe(b.volunteerId)
    for (const r of [a, b]) {
      expect(r.volunteer).toMatchObject({ firstName: ERASED_FIRST_NAME, email: null, phone: null, active: false, organizationId: orgId })
      expect(r.volunteer.erasedAt).not.toBeNull()
      expect(r).toMatchObject({ comment: null, phone: null, status: "active" })
      // Attendance and hours stay.
      expect(r.checkedInAt).not.toBeNull()
    }
    // A new personal link nobody was sent.
    expect(a.editTokenHash).not.toBe(oldA.editTokenHash)
    // Already anonymous, the recent event and the members themselves: untouched.
    expect(byId.get(oldErased.id)!.volunteerId).toBe(erased.id)
    expect(byId.get(recentB.id)).toMatchObject({ volunteerId: bruno.id, comment: "Je viens avec ma fille" })
    expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: alice.id } })).toMatchObject({ firstName: "Alice", email: `${tag}-a@example.org` })

    expect(await prisma.questionAnswer.count({ where: { eventId: old.id } })).toBe(0)
    expect(await prisma.memberInvite.count({ where: { eventId: old.id } })).toBe(0)
    expect(await prisma.sectorLeader.count({ where: { eventId: old.id } })).toBe(0)
    expect(await prisma.eventLog.count({ where: { eventId: old.id, actorId: alice.id } })).toBe(0)
    expect(await prisma.eventLog.count({ where: { eventId: old.id, actorId: a.volunteerId } })).toBe(1)
    expect(await prisma.eventLog.count({ where: { eventId: old.id, action: "event.personal_data_anonymized" } })).toBe(1)
    expect((await prisma.event.findUniqueOrThrow({ where: { id: old.id } })).personalDataAnonymizedAt).toEqual(NOW)
    expect((await prisma.event.findUniqueOrThrow({ where: { id: recent.id } })).personalDataAnonymizedAt).toBeNull()
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: orgId } })).pastEventBatchAt).toEqual(NOW)

    // The anonymous records are not new members (#805).
    const membersAfter = await prisma.platformCounter.findUnique({ where: { metric: "members" } })
    expect(membersAfter?.value).toBe(membersBefore?.value)

    // Done: nothing left to observe or to anonymise.
    expect((await observePastEvents(NOW)).find((r) => r.organizationId === orgId)).toBeUndefined()
    expect((await loadPastEventOrganizations(NOW)).find((o) => o.id === orgId)).toBeUndefined()
    expect(await runPastEventBatch(orgId, NOW)).toMatchObject({ events: 0, registrations: 0 })
  })

  it("enqueues the notice once per active administrator and marks the organisation", async () => {
    const org = await prisma.organization.create({ data: { name: `Notice ${tag}`, slug: `${tag}-notice` } })
    try {
      await prisma.event.create({ data: { organizationId: org.id, slug: "fete-2021", title: "Fête 2021", startDate: new Date("2021-06-01"), endDate: new Date("2021-06-01"), publicStatus: "published" } })
      await prisma.adminUser.create({ data: { organizationId: org.id, email: `${tag}-admin@example.org`, name: "Admin", passwordHash: "x", isActive: true } })
      await prisma.adminUser.create({ data: { organizationId: org.id, email: `${tag}-gone@example.org`, name: "Parti", passwordHash: "x", isActive: false } })

      await sendPastEventNotice(org.id, { registrations: 0, membersOnlyOld: 0 }, new Date("2026-11-09T02:00:00Z"), NOW)
      // Enqueued again (a retried night): the dedupe key keeps one email per administrator.
      await sendPastEventNotice(org.id, { registrations: 0, membersOnlyOld: 0 }, new Date("2026-11-09T02:00:00Z"), NOW)

      const rows = await prisma.notificationOutbox.findMany({ where: { organizationId: org.id } })
      expect(rows.map((r) => r.dedupeKey)).toEqual([`past_event_notice:${org.id}:${tag}-admin@example.org`])
      expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).pastEventNoticeAt).toEqual(NOW)
    } finally {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: org.id } })
      await prisma.adminUser.deleteMany({ where: { organizationId: org.id } })
      await prisma.organization.delete({ where: { id: org.id } })
    }
  })
})
