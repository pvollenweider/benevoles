// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"

/**
 * Generated assignment proposals (#1172) against a real Postgres: what only a database proves.
 * A run is launched once per key, computed, and written into draft assignments only (never a
 * registration, never an email); the frozen replacement set is respected (manual and locked drafts
 * stay); inputs changed during the computation are caught when writing (D04, D05); a write racing a
 * publication never overfills a shift (D07); a cancellation, a lost lease or an erasure during the
 * computation writes nothing (D08); erasure, merge and the past-event anonymisation handle the rows.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn().mockResolvedValue({ ok: true }) }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { createDraft, publishDrafts, reviewDraft, setDraftLock } from "@/lib/draft-assignments-server"
import { proposalConfigSchema, type ProposalConfig } from "@/lib/proposal-config"
import { cancelRun, claimNext, drainProposalRuns, executeRun, expireRuns, launchProposal, listRuns, readRun, writeRunResult } from "@/lib/proposal-runs-server"
import { saveTargets } from "@/lib/proposal-targets-server"
import { runMemberMerge } from "@/lib/member-merge-transaction"
import { runMemberErasure } from "@/lib/member-erasure-transaction"
import { anonymisePastEvent } from "@/lib/past-event-anonymisation"
import { buildPolicy } from "@/lib/workload-policy"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"

const url = process.env.DATABASE_URL
const tag = `int-proposals-${Date.now()}`
const TZ = "Europe/Zurich"
const ADMIN = { type: "admin" as const, id: "admin-1" }
const POLICY = buildPolicy({
  serviceDayStart: "06:00", maxContinuousMinutes: 6 * 60, minBreakMinutes: 20, maxDailyMinutes: 10 * 60, maxEventMinutes: 48 * 60, minRestMinutes: 11 * 60, maxIdleGapMinutes: 3 * 60,
}, TZ)

describe.skipIf(!url)("generated proposals on Postgres (#1172)", () => {
  let orgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ } })).id
  })
  // Never leave a run waiting: another test's drain would claim it.
  afterEach(async () => {
    await prisma.proposalRun.updateMany({ where: { event: { organizationId: orgId }, status: { in: ["queued", "running"] } }, data: { status: "interrupted", stopReason: "cancelled", leaseToken: null } })
  })
  afterAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
    await prisma.event.deleteMany({ where: { organizationId: orgId } })
    await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
    await prisma.erasureRecord.deleteMany({ where: { organizationId: orgId } })
    await prisma.orgLog.deleteMany({ where: { organizationId: orgId } })
    await prisma.organization.delete({ where: { id: orgId } })
    await prisma.$disconnect()
  })

  const db = () => getOrgClient(orgId)
  const event = (extra: Record<string, unknown> = {}) => prisma.event.create({
    data: {
      organizationId: orgId, slug: `${tag}-${++n}`, title: "Festival des Rives", publicStatus: "published", startDate: new Date("2031-07-10"), endDate: new Date("2031-07-12"),
      availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ, workloadProtectionEnabled: true, workloadPolicy: POLICY as object, ...extra,
    },
  })
  const shift = (eventId: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
    prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2031-07-11T00:00:00Z"), startTime: start, endTime: end, capacity: 1, mealOnTheGo: true, ...extra } })
  const member = (firstName: string, lastName: string) =>
    prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName, email: `${tag}-${firstName.toLowerCase()}-${++n}@example.org`, birthDate: new Date("1990-03-04") } })
  const answer = (eventId: string, volunteerId: string, ranges: { start: string; end: string }[] = [{ start: "06:00", end: "23:30" }]) =>
    prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId, volunteerId, days: [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges }, { date: "2031-07-12", ranges: [] }], by: "admin" }))
  const target = (eventId: string, volunteerId: string, minutes: number) =>
    saveTargets(db(), { eventId, organizationId: orgId, changes: [{ volunteerId, targetMinutes: minutes }], actorId: "admin-1" })
  const config = (shiftIds: string[], volunteerIds: string[], extra: Partial<ProposalConfig> = {}): ProposalConfig =>
    proposalConfigSchema.parse({ scope: { shiftIds, volunteerIds }, rotation: { maxConsecutiveDays: 2, maxNightAddOns: 2 }, seed: 7, budget: { evaluations: 500 }, ...extra })
  const launch = async (eventId: string, c: ProposalConfig, key = `key-${++n}`) => {
    const r = await launchProposal(db(), { eventId, actorId: "admin-1", idempotencyKey: key, config: c })
    if (!r.ok) throw new Error(`launch refused: ${r.error}`)
    return r.runId
  }
  /** A small event: two shifts, two people available all day with targets. */
  async function team() {
    const e = await event()
    const morning = await shift(e.id, "08:00", "12:00")
    const evening = await shift(e.id, "16:00", "20:00", { roleName: "Accueil", label: "Accueil" })
    const nadia = await member("Nadia", "Rochat"), luca = await member("Luca", "Bianchi")
    for (const p of [nadia, luca]) { await answer(e.id, p.id); await target(e.id, p.id, 4 * 60) }
    return { e, morning, evening, nadia, luca, c: config([morning.id, evening.id], [nadia.id, luca.id]) }
  }
  const pending = (eventId: string) => prisma.draftAssignment.findMany({ where: { eventId, status: "draft" }, orderBy: { shiftId: "asc" } })

  describe("launch", () => {
    it("records a queued run once per key, refuses another choice under the same key and a second active run", async () => {
      const { e, c, nadia } = await team()
      const id = await launch(e.id, c, "same-key-1")
      expect(await launchProposal(db(), { eventId: e.id, actorId: null, idempotencyKey: "same-key-1", config: c })).toEqual({ ok: true, runId: id, replay: true, notice: null })
      expect(await launchProposal(db(), { eventId: e.id, actorId: null, idempotencyKey: "same-key-1", config: { ...c, seed: 8 } })).toMatchObject({ ok: false, status: 409, code: "key_reused" })
      expect(await launchProposal(db(), { eventId: e.id, actorId: null, idempotencyKey: "other-key-1", config: { ...c, seed: 8 } })).toMatchObject({ ok: false, status: 409, code: "active" })
      const run = await prisma.proposalRun.findUniqueOrThrow({ where: { id } })
      expect(run).toMatchObject({ status: "queued", seed: 7, inputVersion: 1 })
      expect(JSON.stringify(run.snapshot)).not.toContain("Nadia")
      expect(JSON.stringify(run.snapshot)).toContain(nadia.id)
    })

    it("refuses without a complete workload protection (P14), without targets, and when nobody answered (D01)", async () => {
      const off = await event({ workloadProtectionEnabled: false, workloadPolicy: undefined })
      const s = await shift(off.id, "08:00", "12:00")
      const ana = await member("Ana", "Silva")
      await answer(off.id, ana.id)
      await target(off.id, ana.id, 60)
      expect(await launchProposal(db(), { eventId: off.id, actorId: null, idempotencyKey: `k-${++n}`, config: config([s.id], [ana.id]) })).toMatchObject({ ok: false, code: "policy_missing" })
      const e = await event()
      const s2 = await shift(e.id, "08:00", "12:00")
      const tom = await member("Tom", "Keller")
      expect(await launchProposal(db(), { eventId: e.id, actorId: null, idempotencyKey: `k-${++n}`, config: config([s2.id], [tom.id]) })).toMatchObject({ ok: false, code: "targets_missing" })
      await target(e.id, tom.id, 60)
      expect(await launchProposal(db(), { eventId: e.id, actorId: null, idempotencyKey: `k-${++n}`, config: config([s2.id], [tom.id]) })).toMatchObject({ ok: false, code: "no_availability" })
      expect(await prisma.proposalRun.count({ where: { eventId: { in: [off.id, e.id] } } })).toBe(0)
    })
  })

  describe("computation and writing", () => {
    it("writes draft assignments only, explains them, and is not stale right after", async () => {
      const { e, c } = await team()
      const id = await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      const run = await prisma.proposalRun.findUniqueOrThrow({ where: { id } })
      expect(run).toMatchObject({ status: "finished", outcome: "complete", writtenCount: 2, droppedCount: 0, leaseToken: null })
      const drafts = await pending(e.id)
      expect(drafts).toHaveLength(2)
      expect(drafts.every((d) => d.source === "proposal" && d.proposalRunId === id && !d.locked)).toBe(true)
      expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(0)
      expect(await prisma.eventLog.count({ where: { eventId: e.id, action: "proposal.written", entityId: id } })).toBe(1)
      const view = await readRun(db(), e.id, id)
      expect(view).toMatchObject({ status: "finished", stale: [], report: { outcome: "complete" } })
      expect((await listRuns(db(), e.id)).map((r) => r.id)).toEqual([id])
    })

    it("replaces only the earlier unlocked proposal drafts of the scope; locked and manual drafts stay as inputs", async () => {
      const { e, morning, evening, nadia, luca, c } = await team()
      await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      const [first, second] = await pending(e.id)
      // One locked by the organiser, the other left as it was.
      const locked = await setDraftLock(db(), { eventId: e.id, draftId: first.id, revision: first.revision, locked: true })
      expect(locked).toMatchObject({ ok: true, value: { locked: true, revision: first.revision + 1 } })
      const late = await shift(e.id, "21:00", "23:00", { roleName: "Nuit", label: "Nuit" })
      const manual = await createDraft(db(), { eventId: e.id, shiftId: late.id, volunteerId: nadia.id, actorId: "admin-1" })
      expect(manual.ok).toBe(true)
      const id2 = await launch(e.id, config([morning.id, evening.id, late.id], [nadia.id, luca.id], { seed: 8 }))
      await drainProposalRuns({ wait: true })
      const after = await pending(e.id)
      expect(after.find((d) => d.id === first.id)).toMatchObject({ locked: true }) // kept
      expect(after.find((d) => d.source === "manual")).toMatchObject({ shiftId: late.id, volunteerId: nadia.id }) // kept
      expect((await prisma.draftAssignment.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("discarded")
      // One pending draft per seat: the locked and manual ones held theirs, the run filled the rest.
      expect(after.filter((d) => d.shiftId === morning.id || d.shiftId === evening.id)).toHaveLength(2)
      expect(after.filter((d) => d.proposalRunId === id2)).toHaveLength(1)
    })

    it("locking or reviewing its own drafts never makes a written run stale", async () => {
      const { e, c } = await team()
      const id = await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      const [d] = await pending(e.id)
      await setDraftLock(db(), { eventId: e.id, draftId: d.id, revision: d.revision, locked: true })
      expect((await readRun(db(), e.id, id))!.stale).toEqual([])
    })

    it("a reviewed generated draft becomes locked", async () => {
      const { e, c } = await team()
      await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      const [d] = await pending(e.id)
      expect(await reviewDraft(db(), { eventId: e.id, draftId: d.id, revision: d.revision, actorId: "admin-1" })).toMatchObject({ ok: true, value: { locked: true } })
    })

    it("D04: an answer changed during the computation drops what no longer fits, and the run says so", async () => {
      const { e, c, nadia, luca } = await team()
      const id = await launch(e.id, c)
      // Nadia now only free in the afternoon, Luca no longer at all, before the run is computed.
      await answer(e.id, nadia.id, [{ start: "14:00", end: "23:00" }])
      await answer(e.id, luca.id, [])
      await drainProposalRuns({ wait: true })
      const run = await prisma.proposalRun.findUniqueOrThrow({ where: { id } })
      const written = run.written as { created: { volunteerId: string }[]; dropped: { volunteerId: string; reason: string }[]; staleAtWrite: string[] }
      expect(written.staleAtWrite).toContain("availability")
      expect(written.created.every((x) => x.volunteerId !== luca.id)).toBe(true)
      expect(written.dropped.length).toBeGreaterThan(0)
      for (const d of await pending(e.id)) expect(d.volunteerId).not.toBe(luca.id)
    })

    it("D04: an answer changed after the write makes the run stale and its draft « à revoir » for publication", async () => {
      const { e, c, nadia } = await team()
      const id = await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      await answer(e.id, nadia.id, [{ start: "06:00", end: "23:00" }])
      expect((await readRun(db(), e.id, id))!.stale).toEqual(["availability"])
      const drafts = await pending(e.id)
      const refused = await publishDrafts(db(), { eventId: e.id, selection: drafts.map((d) => ({ id: d.id, revision: d.revision })), idempotencyKey: `pub-${++n}`, actor: ADMIN, organizer: { email: null, name: null } })
      expect(refused).toMatchObject({ ok: false, code: "refused", problems: [expect.objectContaining({ code: "availability_changed", volunteerId: nadia.id })] })
    })

    it("D05: a registration made during the computation is kept, and the proposal does not write over it", async () => {
      const { e, morning, nadia, c } = await team()
      const id = await launch(e.id, c)
      // A swap or a manual add puts Nadia on the morning shift meanwhile.
      await prisma.registration.create({ data: { eventId: e.id, shiftId: morning.id, volunteerId: nadia.id, status: "active", ...registrationToken.data(generateToken()) } })
      await drainProposalRuns({ wait: true })
      expect(await prisma.registration.count({ where: { shiftId: morning.id, status: "active" } })).toBe(1)
      const run = await prisma.proposalRun.findUniqueOrThrow({ where: { id } })
      expect((run.written as { staleAtWrite: string[] }).staleAtWrite).toContain("commitments")
      // The shift is full now: no pending draft on it.
      expect((await pending(e.id)).filter((d) => d.shiftId === morning.id)).toEqual([])
    })

    it("D07: a write racing a publication never overfills a shift", async () => {
      const { e, morning, evening, nadia, luca, c } = await team()
      await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      const drafts = await pending(e.id)
      const id2 = await launch(e.id, config([morning.id, evening.id], [nadia.id, luca.id], { seed: 99 }))
      const claimed = (await claimNext())!
      expect(claimed.id).toBe(id2)
      await Promise.all([
        executeRun(claimed),
        publishDrafts(db(), { eventId: e.id, selection: drafts.map((d) => ({ id: d.id, revision: d.revision })), idempotencyKey: `pub-${++n}`, actor: ADMIN, organizer: { email: null, name: null } }),
      ])
      for (const s of [morning, evening]) {
        const held = await prisma.registration.count({ where: { shiftId: s.id, status: { in: ["active", "offered", "requested"] } } })
        const drafted = await prisma.draftAssignment.count({ where: { shiftId: s.id, status: "draft" } })
        expect(held + drafted).toBeLessThanOrEqual(1)
      }
    })
  })

  describe("stopping (D08)", () => {
    it("a queued run cancelled stops at once and writes nothing", async () => {
      const { e, c } = await team()
      const id = await launch(e.id, c)
      expect(await cancelRun(db(), { eventId: e.id, runId: id })).toEqual({ ok: true, status: "interrupted" })
      await drainProposalRuns({ wait: true })
      expect(await prisma.proposalRun.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "interrupted", stopReason: "cancelled", writtenAt: null })
      expect(await pending(e.id)).toEqual([])
    })

    it("a running run cancelled stores its result, writes nothing, and the partial result is written only on request, once", async () => {
      const { e, c } = await team()
      const id = await launch(e.id, c)
      const claimed = (await claimNext())!
      expect(await cancelRun(db(), { eventId: e.id, runId: id })).toEqual({ ok: true, status: "running" })
      await executeRun(claimed)
      expect(await prisma.proposalRun.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "interrupted", stopReason: "cancelled", writtenAt: null })
      expect(await pending(e.id)).toEqual([])
      expect(await writeRunResult(db(), { eventId: e.id, runId: id, actorId: "admin-1" })).toMatchObject({ ok: true, replay: false, writtenCount: 2 })
      expect(await writeRunResult(db(), { eventId: e.id, runId: id, actorId: "admin-1" })).toMatchObject({ ok: true, replay: true, writtenCount: 2 })
      expect(await pending(e.id)).toHaveLength(2)
      expect(await cancelRun(db(), { eventId: e.id, runId: id })).toMatchObject({ ok: false, status: 409, code: "written" })
    })

    it("a lost lease writes nothing; the run becomes « recherche interrompue »", async () => {
      const { e, c } = await team()
      const id = await launch(e.id, c)
      const claimed = (await claimNext())!
      await prisma.$executeRaw`UPDATE "ProposalRun" SET "leaseExpiresAt" = now() - interval '1 minute' WHERE id = ${id}`
      await executeRun(claimed)
      expect(await pending(e.id)).toEqual([])
      expect(await expireRuns(db(), e.id)).toBe(1)
      expect(await prisma.proposalRun.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "interrupted", stopReason: "lease_expired" })
    })

    it("a run left queued too long is given up", async () => {
      const { e, c } = await team()
      const id = await launch(e.id, c)
      await prisma.$executeRaw`UPDATE "ProposalRun" SET "createdAt" = now() - interval '1 hour' WHERE id = ${id}`
      await expireRuns(db(), e.id)
      expect(await prisma.proposalRun.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "interrupted", stopReason: "lease_expired" })
    })
  })

  describe("people's data", () => {
    it("an erasure during the computation scrubs the run and fences the attempt off", async () => {
      const { e, c, nadia, luca } = await team()
      const id = await launch(e.id, c)
      const claimed = (await claimNext())!
      await runMemberErasure(db(), orgId, ADMIN, nadia.id, new Date())
      await executeRun(claimed)
      const run = await prisma.proposalRun.findUniqueOrThrow({ where: { id } })
      expect(run).toMatchObject({ status: "interrupted", inputHash: "scrubbed", writtenAt: null })
      expect(JSON.stringify([run.configuration, run.snapshot, run.result])).not.toContain(nadia.id)
      expect(JSON.stringify(run.configuration)).toContain(luca.id)
      expect(await prisma.eventVolunteerTarget.count({ where: { volunteerId: nadia.id } })).toBe(0)
      expect(await pending(e.id)).toEqual([])
    })

    it("a merge moves the targets (the kept record's wins) and removes the absorbed record from runs", async () => {
      const { e, c, nadia, luca } = await team()
      const other = await event()
      await target(other.id, luca.id, 90)
      const id = await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      await runMemberMerge(db(), orgId, ADMIN, nadia.id, luca.id, {})
      expect(await prisma.eventVolunteerTarget.findMany({ where: { volunteerId: nadia.id }, select: { eventId: true, targetMinutes: true }, orderBy: { eventId: "asc" } }))
        .toEqual([{ eventId: e.id, targetMinutes: 240 }, { eventId: other.id, targetMinutes: 90 }].sort((a, b) => (a.eventId < b.eventId ? -1 : 1)))
      const run = await prisma.proposalRun.findUniqueOrThrow({ where: { id } })
      expect(run.inputHash).toBe("scrubbed")
      expect(JSON.stringify(run.configuration)).not.toContain(luca.id)
      expect((await readRun(db(), e.id, id))!.stale).toEqual(["people"])
    })

    it("the past-event anonymisation deletes runs and targets", async () => {
      const { e, c } = await team()
      await launch(e.id, c)
      await drainProposalRuns({ wait: true })
      await anonymisePastEvent(e.id, orgId, new Map(), new Date("2035-01-01T00:00:00Z"))
      expect(await prisma.proposalRun.count({ where: { eventId: e.id } })).toBe(0)
      expect(await prisma.eventVolunteerTarget.count({ where: { eventId: e.id } })).toBe(0)
    })
  })

  describe("targets", () => {
    it("are saved all or nothing at the revision seen, for active members only", async () => {
      const e = await event()
      const ana = await member("Ana", "Silva")
      expect(await saveTargets(db(), { eventId: e.id, organizationId: orgId, changes: [{ volunteerId: ana.id, targetMinutes: 600 }], actorId: null })).toEqual({ ok: true, saved: 1, removed: 0 })
      expect(await saveTargets(db(), { eventId: e.id, organizationId: orgId, changes: [{ volunteerId: ana.id, targetMinutes: 300, revision: 7 }], actorId: null })).toMatchObject({ ok: false, status: 409 })
      expect(await saveTargets(db(), { eventId: e.id, organizationId: orgId, changes: [{ volunteerId: ana.id, targetMinutes: 300, revision: 1 }, { volunteerId: "nobody", targetMinutes: 60 }], actorId: null })).toMatchObject({ ok: false, status: 404 })
      expect((await prisma.eventVolunteerTarget.findFirstOrThrow({ where: { eventId: e.id, volunteerId: ana.id } })).targetMinutes).toBe(600)
      expect(await saveTargets(db(), { eventId: e.id, organizationId: orgId, changes: [{ volunteerId: ana.id, targetMinutes: null, revision: 1 }], actorId: null })).toEqual({ ok: true, saved: 0, removed: 1 })
    })
  })
})
