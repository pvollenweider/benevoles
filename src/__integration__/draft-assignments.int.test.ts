// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * Draft assignments and their publication (#1146, lot C) against a real Postgres: what only a
 * database proves. A publication is all or nothing (a refusal, or a failure after the first write,
 * leaves no registration, no log entry, no email and no publication row); a retry with the same key
 * returns the first result; two publications racing for the last place, or the same click sent
 * twice, end in one of the serial orders; an answer saved during a publication is either seen
 * (refused, « à revoir ») or saved after it; each person's batch is judged as a whole by the workload
 * protection. Drafts never hold a place. Merge, erasure and the past-event anonymisation handle the
 * rows. Only the email send is mocked: the outbox rows are inspected, nothing is delivered.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn().mockResolvedValue({ ok: true }) }))

const outboxHook = vi.hoisted(() => ({ fail: false }))
vi.mock("@/lib/notifications/added-by-organizer", async (orig) => {
  const actual = await orig<typeof import("@/lib/notifications/added-by-organizer")>()
  return {
    ...actual,
    queueAddedByOrganizer: async (...args: Parameters<typeof actual.queueAddedByOrganizer>) => {
      if (outboxHook.fail) {
        outboxHook.fail = false
        throw new Error("outbox write failed")
      }
      return actual.queueAddedByOrganizer(...args)
    },
  }
})

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { loadPersonFits } from "@/lib/availability-assist-data"
import { createDraft, discardDraft, publishDrafts, reviewDraft, type PublishInput } from "@/lib/draft-assignments-server"
import { MERGE_STAMP } from "@/lib/draft-assignments"
import { runMemberMerge } from "@/lib/member-merge-transaction"
import { runMemberErasure } from "@/lib/member-erasure-transaction"
import { anonymisePastEvent } from "@/lib/past-event-anonymisation"
import { buildPolicy } from "@/lib/workload-policy"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"

const url = process.env.DATABASE_URL
const tag = `int-drafts-${Date.now()}`
const TZ = "Europe/Zurich"
const NOW = new Date("2031-06-01T08:00:00Z")
const ADMIN = { type: "admin" as const, id: "admin-1" }
const ORGANIZER = { email: `${tag}-organiser@example.org`, name: "Claire Favre" }

describe.skipIf(!url)("draft assignments and publication on Postgres (#1146, lot C)", () => {
  let orgId = ""
  let otherOrgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ } })).id
    otherOrgId = (await prisma.organization.create({ data: { name: `Autre ${tag}`, slug: `${tag}-b`, timeZone: TZ } })).id
  })
  beforeEach(() => { outboxHook.fail = false })

  afterAll(async () => {
    for (const id of [orgId, otherOrgId].filter(Boolean)) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: id } })
      await prisma.event.deleteMany({ where: { organizationId: id } })
      await prisma.volunteer.deleteMany({ where: { organizationId: id } })
      await prisma.erasureRecord.deleteMany({ where: { organizationId: id } })
      await prisma.orgLog.deleteMany({ where: { organizationId: id } })
      await prisma.organization.delete({ where: { id } })
    }
    await prisma.$disconnect()
  })

  const db = () => getOrgClient(orgId)
  const event = (extra: Record<string, unknown> = {}) => prisma.event.create({
    data: {
      organizationId: orgId, slug: `${tag}-${++n}`, title: "Festival des Rives", publicStatus: "published", startDate: new Date("2031-07-10"), endDate: new Date("2031-07-12"),
      availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ, ...extra,
    },
  })
  const shift = (eventId: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
    prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2031-07-11T00:00:00Z"), startTime: start, endTime: end, capacity: 3, ...extra } })
  const member = (firstName: string, lastName: string, extra: Record<string, unknown> = {}) =>
    prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName, email: `${tag}-${firstName.toLowerCase()}-${++n}@example.org`, ...extra } })
  const draftOn = async (eventId: string, shiftId: string, volunteerId: string, ackKey?: string) => {
    const r = await createDraft(db(), { eventId, shiftId, volunteerId, actorId: "admin-1", ackKey, now: NOW })
    if (!r.ok) throw new Error(`draft refused: ${r.error}`)
    return r.value
  }
  const publish = (eventId: string, drafts: { id: string; revision: number }[], extra: Partial<PublishInput> = {}) =>
    publishDrafts(db(), { eventId, selection: drafts.map((d) => ({ id: d.id, revision: d.revision })), idempotencyKey: `key-${++n}`, actor: ADMIN, organizer: ORGANIZER, now: NOW, ...extra })
  const answerOn = (eventId: string, volunteerId: string, ranges: { start: string; end: string }[]) =>
    prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId, volunteerId, days: [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges }], by: "admin" }))
  const placementEmails = (eventId: string) => prisma.notificationOutbox.findMany({ where: { organizationId: orgId, dedupeKey: { startsWith: `registration_added_by_organizer:${eventId}:` } } })

  describe("drafts", () => {
    it("hold no place and send nothing", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00", { capacity: 1 })
      const nadia = await member("Nadia", "Rochat")
      await draftOn(e.id, s.id, nadia.id)
      expect(await prisma.registration.count({ where: { shiftId: s.id } })).toBe(0)
      expect(await placementEmails(e.id)).toEqual([])
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("open")
    })

    it("refuse a second pending draft, a person already on the shift, a cancelled shift or an inactive member", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      await draftOn(e.id, s.id, nadia.id)
      expect(await createDraft(db(), { eventId: e.id, shiftId: s.id, volunteerId: nadia.id, actorId: null })).toMatchObject({ ok: false, status: 409, code: "draft_exists" })
      const luca = await member("Luca", "Bianchi")
      await prisma.registration.create({ data: { eventId: e.id, shiftId: s.id, volunteerId: luca.id, ...registrationToken.data(generateToken()) } })
      expect(await createDraft(db(), { eventId: e.id, shiftId: s.id, volunteerId: luca.id, actorId: null })).toMatchObject({ ok: false, status: 409, code: "already_on_shift" })
      const cancelled = await shift(e.id, "15:00", "16:00", { status: "cancelled" })
      expect(await createDraft(db(), { eventId: e.id, shiftId: cancelled.id, volunteerId: nadia.id, actorId: null })).toMatchObject({ ok: false, status: 409 })
      const gone = await member("Sofia", "Meier", { active: false })
      expect(await createDraft(db(), { eventId: e.id, shiftId: s.id, volunteerId: gone.id, actorId: null })).toMatchObject({ ok: false, status: 409 })
    })

    it("are refused on an event without dated availability, and on another organisation's rows", async () => {
      const plain = await event({ availabilityEnabled: false, availabilityAdoptedAt: null })
      const s = await shift(plain.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      expect(await createDraft(db(), { eventId: plain.id, shiftId: s.id, volunteerId: nadia.id, actorId: null })).toMatchObject({ ok: false, status: 404 })

      const e = await event()
      const mine = await shift(e.id, "10:00", "14:00")
      const foreigner = await prisma.volunteer.create({ data: { organizationId: otherOrgId, firstName: "Marc", lastName: "Keller" } })
      expect(await createDraft(db(), { eventId: e.id, shiftId: mine.id, volunteerId: foreigner.id, actorId: null })).toMatchObject({ ok: false, status: 404 })
      // Org B's client sees neither the event nor the shift.
      expect(await createDraft(getOrgClient(otherOrgId), { eventId: e.id, shiftId: mine.id, volunteerId: foreigner.id, actorId: null })).toMatchObject({ ok: false, status: 404 })
      const other = await prisma.event.create({ data: { organizationId: orgId, slug: `${tag}-x${++n}`, title: "Autre", startDate: new Date("2031-07-10"), endDate: new Date("2031-07-12"), availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ } })
      expect(await createDraft(db(), { eventId: other.id, shiftId: mine.id, volunteerId: nadia.id, actorId: null })).toMatchObject({ ok: false, status: 404 })
    })

    it("store an acknowledgement only when it is the current one", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      await answerOn(e.id, nadia.id, [{ start: "15:00", end: "18:00" }])
      const key = (await loadPersonFits(db(), e.id, nadia.id, [s.id]))!.fits[0].ackKey!
      expect(await createDraft(db(), { eventId: e.id, shiftId: s.id, volunteerId: nadia.id, actorId: null, ackKey: "a1|stale" })).toMatchObject({ ok: false, code: "availability" })
      const d = await draftOn(e.id, s.id, nadia.id, key)
      expect(d.ackKey).toBe(key)
    })

    it("can be reviewed and discarded only at the revision seen", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      const d = await draftOn(e.id, s.id, nadia.id)
      const reviewed = await reviewDraft(db(), { eventId: e.id, draftId: d.id, revision: d.revision, actorId: "admin-1" })
      expect(reviewed).toMatchObject({ ok: true, value: { revision: d.revision + 1 } })
      expect(await discardDraft(db(), { eventId: e.id, draftId: d.id, revision: d.revision })).toMatchObject({ ok: false, code: "drafts_changed" })
      expect(await discardDraft(db(), { eventId: e.id, draftId: d.id, revision: d.revision + 1 })).toMatchObject({ ok: true })
      expect((await prisma.draftAssignment.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("discarded")
    })
  })

  describe("publication", () => {
    it("turns the selected drafts into active registrations with their log, evidence and one email per person", async () => {
      const e = await event()
      const bar = await shift(e.id, "10:00", "14:00", { capacity: 2 })
      const accueil = await shift(e.id, "15:00", "18:00", { roleName: "Accueil", label: "Accueil" })
      const nadia = await member("Nadia", "Rochat")
      const luca = await member("Luca", "Bianchi", { email: null })
      // Free from 11:00: the bar (10:00-14:00) needs the acknowledgement, the reception does not.
      await answerOn(e.id, nadia.id, [{ start: "11:00", end: "18:00" }])
      const key = (await loadPersonFits(db(), e.id, nadia.id, [bar.id]))!.fits[0].ackKey!
      const drafts = [await draftOn(e.id, bar.id, nadia.id, key), await draftOn(e.id, accueil.id, nadia.id), await draftOn(e.id, bar.id, luca.id)]
      const unselected = await draftOn(e.id, accueil.id, luca.id)

      const result = await publish(e.id, drafts)
      expect(result).toMatchObject({ ok: true, value: { replay: false, people: 2 } })
      if (!result.ok) return
      const regs = await prisma.registration.findMany({ where: { eventId: e.id }, orderBy: { createdAt: "asc" } })
      expect(regs).toHaveLength(3)
      expect(regs.every((r) => r.status === "active" && r.source === "admin_draft" && r.charterAcceptedAt === null)).toBe(true)
      const rows = await prisma.draftAssignment.findMany({ where: { id: { in: drafts.map((d) => d.id) } } })
      expect(rows.every((r) => r.status === "published" && r.publicationId === result.value.publicationId && regs.some((g) => g.id === r.registrationId))).toBe(true)
      expect((await prisma.draftAssignment.findUniqueOrThrow({ where: { id: unselected.id } })).status).toBe("draft")
      expect((await prisma.shift.findUniqueOrThrow({ where: { id: bar.id } })).status).toBe("full")

      const logs = await prisma.eventLog.findMany({ where: { eventId: e.id } })
      const pub = logs.find((l) => l.action === "drafts.published")!
      expect(pub).toMatchObject({ entityType: "DraftPublication", entityId: result.value.publicationId, actorId: "admin-1" })
      expect(logs.filter((l) => l.action === "registration.created" && l.causedByLogId === pub.id)).toHaveLength(3)
      const acks = logs.filter((l) => l.action === "registration.availability_acknowledged")
      expect(acks).toHaveLength(1)
      expect(acks[0].changes).toMatchObject({ availabilityAck: { to: { via: "publish", state: "partial" } } })

      // One grouped email for Nadia (two missions), none for Luca (no address).
      const emails = await placementEmails(e.id)
      expect(emails).toHaveLength(1)
      expect(emails[0].dedupeKey).toContain(nadia.id)
      const publication = await prisma.draftPublication.findUniqueOrThrow({ where: { id: result.value.publicationId } })
      expect(publication).toMatchObject({ draftCount: 3, personCount: 2 })
    })

    it("returns the first result for the same key, and refuses the key for another selection", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      const d = await draftOn(e.id, s.id, nadia.id)
      const first = await publish(e.id, [d], { idempotencyKey: "same" })
      const again = await publish(e.id, [d], { idempotencyKey: "same" })
      expect(again).toMatchObject({ ok: true, value: { replay: true } })
      if (first.ok && again.ok) expect(again.value.drafts).toEqual(first.value.drafts)
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(1)
      expect(await placementEmails(e.id)).toHaveLength(1)
      const other = await draftOn(e.id, (await shift(e.id, "15:00", "16:00")).id, nadia.id)
      expect(await publish(e.id, [other], { idempotencyKey: "same" })).toMatchObject({ ok: false, status: 409, code: "key_reused" })
    })

    it("refuses the whole batch on one problem, listing every problem, and changes nothing", async () => {
      const e = await event()
      const full = await shift(e.id, "10:00", "14:00", { capacity: 1 })
      const free = await shift(e.id, "15:00", "18:00")
      const nadia = await member("Nadia", "Rochat")
      const luca = await member("Luca", "Bianchi")
      const sofia = await member("Sofia", "Meier", { birthDate: null })
      const minor = await shift(e.id, "19:00", "20:00", { minAge: 18 })
      const drafts = [await draftOn(e.id, full.id, nadia.id), await draftOn(e.id, full.id, luca.id), await draftOn(e.id, free.id, luca.id), await draftOn(e.id, minor.id, sofia.id)]
      const result = await publish(e.id, drafts)
      expect(result).toMatchObject({ ok: false, status: 409, code: "refused" })
      if (result.ok) return
      expect(result.problems!.map((p) => p.code).sort()).toEqual(["birthdate_missing", "capacity"])
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.draftPublication.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.eventLog.count({ where: { eventId: e.id } })).toBe(0)
      expect(await placementEmails(e.id)).toEqual([])
      const rows = await prisma.draftAssignment.findMany({ where: { eventId: e.id } })
      expect(rows.every((r) => r.status === "draft" && r.revision === 1)).toBe(true)
    })

    it("rolls everything back when a write fails after the first registration", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      const luca = await member("Luca", "Bianchi")
      const drafts = [await draftOn(e.id, s.id, nadia.id), await draftOn(e.id, s.id, luca.id)]
      outboxHook.fail = true
      await expect(publish(e.id, drafts, { idempotencyKey: "retry-me" })).rejects.toThrow("outbox write failed")
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.draftPublication.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.eventLog.count({ where: { eventId: e.id } })).toBe(0)
      // The key was never committed: the same click succeeds afterwards.
      expect(await publish(e.id, drafts, { idempotencyKey: "retry-me" })).toMatchObject({ ok: true, value: { replay: false } })
    })

    it("refuses drafts edited, discarded or published since they were selected", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      const d = await draftOn(e.id, s.id, nadia.id)
      await reviewDraft(db(), { eventId: e.id, draftId: d.id, revision: d.revision, actorId: null })
      expect(await publish(e.id, [d])).toMatchObject({ ok: false, code: "drafts_changed" })
      expect(await publish(e.id, [{ id: "missing", revision: 1 }])).toMatchObject({ ok: false, code: "drafts_changed" })
    })

    it("refuses a draft whose answer changed since its review, until it is reviewed again", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      await answerOn(e.id, nadia.id, [{ start: "08:00", end: "20:00" }])
      const d = await draftOn(e.id, s.id, nadia.id)
      await answerOn(e.id, nadia.id, [{ start: "07:00", end: "21:00" }])
      const refused = await publish(e.id, [d])
      expect(refused).toMatchObject({ ok: false, code: "refused", problems: [expect.objectContaining({ code: "availability_changed" })] })
      const again = await reviewDraft(db(), { eventId: e.id, draftId: d.id, revision: d.revision, actorId: "admin-1" })
      if (!again.ok) throw new Error(again.error)
      expect(await publish(e.id, [again.value])).toMatchObject({ ok: true })
    })

    it("judges each person's whole batch with the workload protection, not each draft alone", async () => {
      const policy = buildPolicy({ serviceDayStart: "06:00", maxContinuousMinutes: 6 * 60, minBreakMinutes: 30, maxDailyMinutes: 10 * 60, maxEventMinutes: 40 * 60, minRestMinutes: 10 * 60, maxIdleGapMinutes: 2 * 60 }, TZ)
      const e = await event({ workloadProtectionEnabled: true, workloadPolicy: policy as object })
      const morning = await shift(e.id, "08:00", "14:00")
      const evening = await shift(e.id, "15:00", "21:00", { roleName: "Accueil", label: "Accueil" })
      const nadia = await member("Nadia", "Rochat")
      const a = await draftOn(e.id, morning.id, nadia.id), b = await draftOn(e.id, evening.id, nadia.id)
      const refused = await publish(e.id, [a, b])
      expect(refused).toMatchObject({ ok: false, code: "refused", problems: [expect.objectContaining({ code: "workload", volunteerId: nadia.id })] })
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)
      // Each alone fits: the batch, never the row, is what the protection refuses.
      expect(await publish(e.id, [a])).toMatchObject({ ok: true })
    })
  })

  describe("concurrency", () => {
    it("gives the last place to one of two publications racing for it", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00", { capacity: 1 })
      const nadia = await member("Nadia", "Rochat"), luca = await member("Luca", "Bianchi")
      const a = await draftOn(e.id, s.id, nadia.id), b = await draftOn(e.id, s.id, luca.id)
      const results = await Promise.all([publish(e.id, [a]), publish(e.id, [b])])
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(results.find((r) => !r.ok)).toMatchObject({ code: "refused", problems: [expect.objectContaining({ code: "capacity" })] })
      expect(await prisma.registration.count({ where: { shiftId: s.id, status: "active" } })).toBe(1)
    })

    it("publishes once when the same click arrives twice at the same time", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      const d = await draftOn(e.id, s.id, nadia.id)
      const results = await Promise.all([publish(e.id, [d], { idempotencyKey: "double" }), publish(e.id, [d], { idempotencyKey: "double" })])
      expect(results.every((r) => r.ok)).toBe(true)
      expect(results.filter((r) => r.ok && r.value.replay)).toHaveLength(1)
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(1)
      expect(await prisma.draftPublication.count({ where: { eventId: e.id } })).toBe(1)
    })

    it("judges one person's drafts published in two racing batches together", async () => {
      const policy = buildPolicy({ serviceDayStart: "06:00", maxContinuousMinutes: 6 * 60, minBreakMinutes: 30, maxDailyMinutes: 10 * 60, maxEventMinutes: 40 * 60, minRestMinutes: 10 * 60, maxIdleGapMinutes: 2 * 60 }, TZ)
      const e = await event({ workloadProtectionEnabled: true, workloadPolicy: policy as object })
      const morning = await shift(e.id, "08:00", "14:00"), evening = await shift(e.id, "15:00", "21:00", { roleName: "Accueil", label: "Accueil" })
      const nadia = await member("Nadia", "Rochat")
      const a = await draftOn(e.id, morning.id, nadia.id), b = await draftOn(e.id, evening.id, nadia.id)
      const results = await Promise.all([publish(e.id, [a]), publish(e.id, [b])])
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      expect(results.find((r) => !r.ok)).toMatchObject({ problems: [expect.objectContaining({ code: "workload" })] })
    })

    it("sees an answer saved during the publication, or is seen by it: never both", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      await answerOn(e.id, nadia.id, [{ start: "08:00", end: "20:00" }])
      const d = await draftOn(e.id, s.id, nadia.id)
      const [published] = await Promise.all([publish(e.id, [d]), answerOn(e.id, nadia.id, [{ start: "15:00", end: "20:00" }])])
      const request = await prisma.availabilityRequest.findFirstOrThrow({ where: { eventId: e.id, volunteerId: nadia.id } })
      expect(request.revision).toBe(2)
      if (published.ok) expect(await prisma.registration.count({ where: { eventId: e.id, status: "active" } })).toBe(1)
      else expect(published).toMatchObject({ problems: [expect.objectContaining({ code: "availability_changed" })] })
    })

    it("refuses a publication racing a change of the shift's hours", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      const d = await draftOn(e.id, s.id, nadia.id)
      let release!: () => void
      const held = new Promise<void>((r) => { release = r })
      let locked!: () => void
      const lockedP = new Promise<void>((r) => { locked = r })
      const edit = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ${s.id} FOR UPDATE`
        locked()
        await held
        await tx.shift.update({ where: { id: s.id }, data: { startTime: "11:00" } })
      })
      await lockedP
      const publishing = publish(e.id, [d])
      await new Promise((r) => setTimeout(r, 200))
      release()
      await edit
      expect(await publishing).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "shift_changed" })] })
    })
  })

  describe("member and event lifecycle", () => {
    it("moves drafts on a merge, « à revoir », and discards a duplicate pending one", async () => {
      const e = await event()
      const a = await shift(e.id, "10:00", "14:00"), b = await shift(e.id, "15:00", "18:00")
      const keep = await member("Nadia", "Rochat"), absorb = await member("Nadia", "Rochat")
      const kept = await draftOn(e.id, a.id, keep.id)
      const same = await draftOn(e.id, a.id, absorb.id)
      const moved = await draftOn(e.id, b.id, absorb.id)
      await runMemberMerge(db(), orgId, ADMIN, keep.id, absorb.id, {})
      const rows = new Map((await prisma.draftAssignment.findMany({ where: { id: { in: [kept.id, same.id, moved.id] } } })).map((r) => [r.id, r]))
      expect(rows.get(kept.id)).toMatchObject({ volunteerId: keep.id, status: "draft" })
      expect(rows.get(same.id)).toMatchObject({ volunteerId: keep.id, status: "discarded" })
      expect(rows.get(moved.id)).toMatchObject({ volunteerId: keep.id, status: "draft", availabilityStamp: MERGE_STAMP, revision: moved.revision + 1 })
      const refused = await publish(e.id, [rows.get(moved.id)!])
      expect(refused).toMatchObject({ ok: false, problems: [expect.objectContaining({ code: "availability_changed" })] })
    })

    it("deletes the person's drafts on erasure, the registrations they became staying", async () => {
      const e = await event()
      const a = await shift(e.id, "10:00", "14:00"), b = await shift(e.id, "15:00", "18:00")
      const nadia = await member("Nadia", "Rochat")
      const published = await draftOn(e.id, a.id, nadia.id)
      await publish(e.id, [published])
      await draftOn(e.id, b.id, nadia.id)
      await runMemberErasure(db(), orgId, ADMIN, nadia.id, NOW)
      expect(await prisma.draftAssignment.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(1)
    })

    it("deletes drafts and publications with the past event's personal data", async () => {
      const e = await event()
      const a = await shift(e.id, "10:00", "14:00"), b = await shift(e.id, "15:00", "18:00")
      const nadia = await member("Nadia", "Rochat")
      await publish(e.id, [await draftOn(e.id, a.id, nadia.id)])
      await draftOn(e.id, b.id, nadia.id)
      await anonymisePastEvent(e.id, orgId, new Map(), new Date("2035-01-01T00:00:00Z"))
      expect(await prisma.draftAssignment.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.draftPublication.count({ where: { eventId: e.id } })).toBe(0)
    })

    it("removes drafts with their shift", async () => {
      const e = await event()
      const s = await shift(e.id, "10:00", "14:00")
      const nadia = await member("Nadia", "Rochat")
      await draftOn(e.id, s.id, nadia.id)
      await prisma.shift.delete({ where: { id: s.id } })
      expect(await prisma.draftAssignment.count({ where: { eventId: e.id } })).toBe(0)
    })
  })
})
