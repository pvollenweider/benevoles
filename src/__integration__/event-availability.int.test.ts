// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Dated availability (#1146, lot A) against a real Postgres: the unit tests cover the rules
 * (src/lib/__tests__/event-availability.test.ts); this proves the writes (one transaction, nothing
 * written on a refusal, overnight instants), concurrency under the person's lock, the database
 * check on a range, tenant scoping, and what erasure, merge and the past-event anonymisation do.
 */

vi.mock("next/server", () => ({ after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock("@/lib/notification-helpers", () => ({ sendMemberInvite: vi.fn().mockResolvedValue({ ok: true }) }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { readAvailability, saveAvailabilityAnswers } from "@/lib/event-availability-data"
import type { DayAnswerInput } from "@/lib/event-availability"
import { runMemberErasure } from "@/lib/member-erasure-transaction"
import { runMemberMerge } from "@/lib/member-merge-transaction"
import { runPastEventBatch } from "@/lib/past-event-anonymisation"

const url = process.env.DATABASE_URL
const tag = `int-avail-${Date.now()}`
const ADMIN_ACTOR = { type: "admin" as const, id: "adm-test" }
const TZ = "Europe/Zurich"

describe.skipIf(!url)("dated availability (#1146)", () => {
  let orgId = ""
  let otherOrgId = ""
  let eventId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: "Org dispo", slug: `${tag}-org` } })).id
    otherOrgId = (await prisma.organization.create({ data: { name: "Autre org", slug: `${tag}-other` } })).id
    eventId = (await prisma.event.create({
      data: { organizationId: orgId, slug: "festival", title: "Festival", startDate: new Date("2030-07-10"), endDate: new Date("2030-07-12"), availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ },
    })).id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  const member = (organizationId = orgId, extra: Record<string, unknown> = {}) =>
    prisma.volunteer.create({ data: { organizationId, firstName: "Alice", lastName: `D-${++n}`, email: `${tag}-${n}@example.org`, ...extra } })
  const save = (volunteerId: string, days: DayAnswerInput[], on = eventId) =>
    prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId: on, volunteerId, days, by: "volunteer" }))
  const range = (start: string, end: string) => ({ start, end })

  it("stores dated ranges as instants, a night ending the next morning, and replaces only the dates submitted", async () => {
    const v = await member()
    const first = await save(v.id, [{ date: "2030-07-10", ranges: [range("08:00", "14:00"), range("20:00", "03:00")] }, { date: "2030-07-11", ranges: [] }])
    expect(first).toMatchObject({ ok: true, revision: 1 })
    let stored = await readAvailability(prisma, eventId, v.id)
    expect(stored?.answeredBy).toBe("volunteer")
    expect(stored?.days.map((d) => [d.date, d.ranges.length])).toEqual([["2030-07-10", 2], ["2030-07-11", 0]])
    expect(stored?.days[0].ranges[1]).toMatchObject({ startTime: "20:00", endTime: "03:00", startsAt: new Date("2030-07-10T18:00:00Z"), endsAt: new Date("2030-07-11T01:00:00Z") })

    const second = await save(v.id, [{ date: "2030-07-11", ranges: [range("14:00", "20:00")] }])
    expect(second).toMatchObject({ ok: true, revision: 2 })
    stored = await readAvailability(prisma, eventId, v.id)
    expect(stored?.days.map((d) => [d.date, d.ranges.length])).toEqual([["2030-07-10", 2], ["2030-07-11", 1]])
    expect(await prisma.availabilityRange.count({ where: { day: { request: { volunteerId: v.id } } } })).toBe(3)
  })

  it("writes nothing when it refuses", async () => {
    const v = await member()
    await save(v.id, [{ date: "2030-07-11", ranges: [range("01:00", "05:00")] }])
    // A night of the 10th running into the 11th's early range.
    expect(await save(v.id, [{ date: "2030-07-10", ranges: [range("20:00", "03:00")] }])).toMatchObject({ ok: false, status: 400 })
    // A date outside the event.
    expect(await save(v.id, [{ date: "2030-07-13", ranges: [] }])).toMatchObject({ ok: false, status: 400 })
    const stored = await readAvailability(prisma, eventId, v.id)
    expect(stored?.revision).toBe(1)
    expect(stored?.days.map((d) => d.date)).toEqual(["2030-07-11"])
  })

  it("refuses an event that does not collect availability, or whose zone is unknown (fail closed)", async () => {
    const v = await member()
    const off = await prisma.event.create({ data: { organizationId: orgId, slug: `off-${tag}`, title: "Off", startDate: new Date("2030-07-10"), endDate: new Date("2030-07-10") } })
    expect(await save(v.id, [{ date: "2030-07-10", ranges: [] }], off.id)).toMatchObject({ ok: false, status: 409 })
    const noZone = await prisma.event.create({ data: { organizationId: orgId, slug: `nozone-${tag}`, title: "Sans zone", startDate: new Date("2030-07-10"), endDate: new Date("2030-07-10"), availabilityEnabled: true } })
    expect(await save(v.id, [{ date: "2030-07-10", ranges: [] }], noZone.id)).toMatchObject({ ok: false, status: 409 })
    expect(await prisma.availabilityRequest.count({ where: { volunteerId: v.id } })).toBe(0)
  })

  it("refuses a person of another organisation, an inactive, erased or merged record", async () => {
    const foreign = await member(otherOrgId)
    const inactive = await member(orgId, { active: false })
    const erased = await member(orgId, { erasedAt: new Date() })
    const keep = await member()
    const merged = await member(orgId, { mergedIntoId: keep.id, active: false })
    for (const v of [foreign, inactive, erased, merged]) {
      expect(await save(v.id, [{ date: "2030-07-10", ranges: [] }])).toMatchObject({ ok: false, status: 404 })
    }
    expect(await prisma.availabilityRequest.count({ where: { volunteerId: { in: [foreign.id, inactive.id, erased.id, merged.id] } } })).toBe(0)
  })

  it("serialises two answers of the same person: both dates land, or the overlapping one is refused", async () => {
    const v = await member()
    const [a, b] = await Promise.all([
      save(v.id, [{ date: "2030-07-10", ranges: [range("08:00", "12:00")] }]),
      save(v.id, [{ date: "2030-07-11", ranges: [range("08:00", "12:00")] }]),
    ])
    expect([a.ok, b.ok]).toEqual([true, true])
    const stored = await readAvailability(prisma, eventId, v.id)
    expect(stored?.revision).toBe(2)
    expect(stored?.days.map((d) => d.date)).toEqual(["2030-07-10", "2030-07-11"])

    const w = await member()
    const results = await Promise.all([
      save(w.id, [{ date: "2030-07-10", ranges: [range("20:00", "03:00")] }]),
      save(w.id, [{ date: "2030-07-11", ranges: [range("01:00", "05:00")] }]),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ status: 400 })])
  })

  it("refuses at the database a range that does not end after it starts", async () => {
    const v = await member()
    await save(v.id, [{ date: "2030-07-12", ranges: [range("10:00", "12:00")] }])
    const r = await prisma.availabilityRange.findFirstOrThrow({ where: { day: { request: { volunteerId: v.id } } } })
    await expect(prisma.availabilityRange.update({ where: { id: r.id }, data: { endsAt: r.startsAt } })).rejects.toThrow()
  })

  it("never shows one organisation's answers to another", async () => {
    const v = await member()
    await save(v.id, [{ date: "2030-07-10", ranges: [range("08:00", "12:00")] }])
    const other = getOrgClient(otherOrgId)
    expect(await other.availabilityRequest.findMany({ where: { volunteerId: v.id } })).toEqual([])
    expect(await other.availabilityDay.count({ where: { eventId } })).toBe(0)
    expect(await other.availabilityRange.count({ where: { eventId } })).toBe(0)
    expect(await getOrgClient(orgId).availabilityRange.count({ where: { day: { request: { volunteerId: v.id } } } })).toBe(1)
  })

  it("is deleted with the person's data on erasure", async () => {
    const v = await member()
    await save(v.id, [{ date: "2030-07-10", ranges: [range("08:00", "12:00")] }])
    await runMemberErasure(getOrgClient(orgId), orgId, ADMIN_ACTOR, v.id)
    expect(await prisma.availabilityRequest.count({ where: { volunteerId: v.id } })).toBe(0)
    expect(await prisma.availabilityRange.count({ where: { day: { request: { volunteerId: v.id } } } })).toBe(0)
  })

  it("follows a merge: moved when only the absorbed record answered, kept and flagged when both answered differently", async () => {
    const keep = await member()
    const absorb = await member()
    await save(absorb.id, [{ date: "2030-07-10", ranges: [range("08:00", "12:00")] }])
    await runMemberMerge(getOrgClient(orgId), orgId, ADMIN_ACTOR, keep.id, absorb.id, {})
    const moved = await readAvailability(prisma, eventId, keep.id)
    expect(moved?.days.map((d) => d.date)).toEqual(["2030-07-10"])
    expect(moved?.reviewNeededAt).toBeNull()

    const absorb2 = await member()
    await save(absorb2.id, [{ date: "2030-07-10", ranges: [range("14:00", "18:00")] }, { date: "2030-07-11", ranges: [range("08:00", "12:00")] }])
    await runMemberMerge(getOrgClient(orgId), orgId, ADMIN_ACTOR, keep.id, absorb2.id, {})
    const kept = await readAvailability(prisma, eventId, keep.id)
    // The kept record's answer, never the union of both.
    expect(kept?.days.map((d) => [d.date, d.ranges.map((r) => r.startTime)])).toEqual([["2030-07-10", ["08:00"]]])
    expect(kept?.reviewReason).toBe("merge")
    expect(kept?.reviewNeededAt).not.toBeNull()
    expect(await prisma.availabilityRequest.count({ where: { volunteerId: { in: [absorb.id, absorb2.id] } } })).toBe(0)
  })

  it("goes with the event's personal data once the event is past", async () => {
    const old = await prisma.event.create({
      data: { organizationId: orgId, slug: `old-${tag}`, title: "Ancien", startDate: new Date("2022-06-01"), endDate: new Date("2022-06-01"), availabilityEnabled: true, availabilityTimeZone: TZ },
    })
    const v = await member()
    await save(v.id, [{ date: "2022-06-01", ranges: [range("08:00", "12:00")] }], old.id)
    await save(v.id, [{ date: "2030-07-10", ranges: [range("08:00", "12:00")] }])
    await runPastEventBatch(orgId, new Date("2026-10-10T02:00:00Z"))
    expect(await prisma.availabilityRequest.count({ where: { eventId: old.id } })).toBe(0)
    expect(await prisma.availabilityDay.count({ where: { eventId: old.id } })).toBe(0)
    expect(await prisma.availabilityRequest.count({ where: { eventId, volunteerId: v.id } })).toBe(1)
  })
})
