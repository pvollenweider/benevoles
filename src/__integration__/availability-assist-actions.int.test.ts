// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"

/**
 * The availability acknowledgement on the other organiser actions (#1146, lot B follow-up),
 * against a real Postgres: accepting a request, « Rétablir » and approving a swap. Each refuses
 * without the acknowledgement and changes nothing (the request still pending, the registration
 * still cancelled, the swap still waiting); accepts the key the dialog received; writes the
 * evidence in the same transaction (an outbox failure after it rolls everything back, the
 * evidence included); and reads the answer under the person's lock, so an acknowledgement given on
 * an answer corrected meanwhile no longer applies. A swap confirmed by the volunteers alone, with
 * no approval, is not asked anything. Only email is mocked.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))

const outboxHook = vi.hoisted(() => ({ fail: false }))
vi.mock("@/lib/notifications/outbox", async (orig) => {
  const actual = await orig<typeof import("@/lib/notifications/outbox")>()
  return {
    ...actual,
    enqueueNotifications: async (...args: Parameters<typeof actual.enqueueNotifications>) => {
      if (outboxHook.fail) {
        outboxHook.fail = false
        throw new Error("outbox write failed")
      }
      return actual.enqueueNotifications(...args)
    },
  }
})

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { loadPersonFits } from "@/lib/availability-assist-data"
import { decideRequest } from "@/lib/registration-decision"
import { restoreRegistration } from "@/lib/registration-restore-action"
import { confirmSwap, decideSwap, offerSwap, publishSwapRequest } from "@/lib/shift-swap-server"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"

const url = process.env.DATABASE_URL
const tag = `int-assist-actions-${Date.now()}`
const TZ = "Europe/Zurich"
const NOW = new Date("2031-06-01T08:00:00Z")
const actor = { type: "admin" as const, id: "admin-1" }

describe.skipIf(!url)("availability acknowledgement on accept, restore and swap approval (#1146, lot B)", () => {
  let orgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ } })).id
  })
  beforeEach(() => { outboxHook.fail = false })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  const db = () => getOrgClient(orgId)
  const event = (extra: Record<string, unknown> = {}) => prisma.event.create({
    data: {
      organizationId: orgId, slug: `${tag}-${++n}`, title: "Festival", publicStatus: "published", startDate: new Date("2031-07-10"), endDate: new Date("2031-07-12"),
      availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ, ...extra,
    },
  })
  const shift = (eventId: string, start: string, end: string, extra: Record<string, unknown> = {}) =>
    prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2031-07-11T00:00:00Z"), startTime: start, endTime: end, capacity: 3, ...extra } })
  const member = (firstName: string, lastName: string) =>
    prisma.volunteer.create({ data: { organizationId: orgId, firstName, lastName, email: `${tag}-${firstName.toLowerCase()}-${++n}@example.org` } })
  const register = (eventId: string, shiftId: string, volunteerId: string, status = "active") =>
    prisma.registration.create({ data: { eventId, shiftId, volunteerId, status, source: "public_form", ...registrationToken.data(generateToken()) } })
  /** Answered the 10th (nothing) and the 11th: free 09:00–12:00 only. */
  const morningOnly = (eventId: string, volunteerId: string) =>
    prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId, volunteerId, days: [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [{ start: "09:00", end: "12:00" }] }], by: "admin" }))
  const keyOf = async (eventId: string, volunteerId: string, shiftId: string) => (await loadPersonFits(db(), eventId, volunteerId, [shiftId]))!.fits[0].ackKey!
  const acks = (eventId: string) => prisma.eventLog.findMany({ where: { eventId, action: "registration.availability_acknowledged" } })

  it("accepting a request: refused without the acknowledgement, accepted with it, the evidence committed with it", async () => {
    const e = await event()
    const bar = await shift(e.id, "14:00", "20:00", { requiresApproval: true })
    const p = await member("Nadia", "Rochat")
    await morningOnly(e.id, p.id)
    const reg = await register(e.id, bar.id, p.id, "requested")

    const refused = await decideRequest(db(), actor, reg.id, { decision: "accept" })
    expect(refused).toMatchObject({ ok: false, httpStatus: 409, code: "availability", outside: [{ volunteerId: p.id, shiftId: bar.id, state: "outside" }] })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("requested")
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId, dedupeKey: `registration_accepted:${reg.id}` } })).toBe(0)

    const key = await keyOf(e.id, p.id, bar.id)
    expect(await decideRequest(db(), actor, reg.id, { decision: "accept", availabilityAck: [key] })).toEqual({ ok: true, status: "active" })
    const [entry] = await acks(e.id)
    expect(entry).toMatchObject({ entityType: "Registration", entityId: reg.id, actorType: "admin", actorId: "admin-1" })
    expect(entry.changes).toMatchObject({ shiftId: { from: bar.id, to: bar.id }, availabilityAck: { to: { v: 1, via: "accept", revision: 1, state: "outside", totalMinutes: 360, outsideMinutes: 360 } } })
  })

  it("an outbox failure after the evidence rolls back the acceptance and its evidence together", async () => {
    const e = await event()
    const bar = await shift(e.id, "14:00", "20:00", { requiresApproval: true })
    const p = await member("Marc", "Favre")
    await morningOnly(e.id, p.id)
    const reg = await register(e.id, bar.id, p.id, "requested")
    const key = await keyOf(e.id, p.id, bar.id)
    outboxHook.fail = true
    await expect(decideRequest(db(), actor, reg.id, { decision: "accept", availabilityAck: [key] })).rejects.toThrow("outbox write failed")
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("requested")
    expect(await acks(e.id)).toHaveLength(0)
  })

  it("an acceptance waiting behind a correction of the same person reads the new answer: the old acknowledgement no longer applies", async () => {
    const e = await event()
    const bar = await shift(e.id, "14:00", "20:00", { requiresApproval: true })
    const p = await member("Léa", "Bonvin")
    await morningOnly(e.id, p.id)
    const reg = await register(e.id, bar.id, p.id, "requested")
    const key = await keyOf(e.id, p.id, bar.id)

    let held!: () => void
    const holding = new Promise<void>((r) => { held = r })
    const correction = prisma.$transaction(async (tx) => {
      await saveAvailabilityAnswers(tx, { eventId: e.id, volunteerId: p.id, days: [{ date: "2031-07-11", ranges: [{ start: "18:00", end: "19:00" }] }], by: "admin" })
      held()
      await new Promise((r) => setTimeout(r, 500))
    }, { timeout: 10_000 })
    await holding
    const res = await decideRequest(db(), actor, reg.id, { decision: "accept", availabilityAck: [key] })
    await correction
    expect(res).toMatchObject({ ok: false, code: "availability" })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("requested")
  })

  it("« Rétablir »: refused without the acknowledgement, the registration still cancelled; restored with it", async () => {
    const e = await event()
    const bar = await shift(e.id, "14:00", "20:00")
    const p = await member("Chloé", "Roy")
    await morningOnly(e.id, p.id)
    const reg = await register(e.id, bar.id, p.id, "cancelled")
    await prisma.eventLog.create({ data: { eventId: e.id, actorType: "volunteer", actorId: p.id, action: "registration.cancelled", entityType: "Registration", entityId: reg.id, changes: { status: { from: "active", to: "cancelled" } } } })

    expect(await restoreRegistration(db(), actor, reg.id, NOW)).toMatchObject({ ok: false, httpStatus: 409, code: "availability" })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("cancelled")

    const key = await keyOf(e.id, p.id, bar.id)
    expect(await restoreRegistration(db(), actor, reg.id, NOW, { availabilityAck: [key] })).toEqual({ ok: true, status: "active" })
    const [entry] = await acks(e.id)
    expect(entry.changes).toMatchObject({ availabilityAck: { to: { via: "restore", outsideMinutes: 360 } } })
  })

  /** Pierre on the morning shift, Jean on the afternoon one, the swap confirmed and waiting (or applied). */
  async function swap(approval: boolean) {
    const e = await event({ shiftSwapsEnabled: true, shiftSwapsApproval: approval })
    const morning = await shift(e.id, "10:00", "12:00")
    const afternoon = await shift(e.id, "14:00", "20:00")
    const pierre = await member("Pierre", "Dupont")
    const jean = await member("Jean", "Martin")
    // Pierre is free in the morning only; Jean never answered (unknown: no acknowledgement).
    await morningOnly(e.id, pierre.id)
    const rp = await register(e.id, morning.id, pierre.id)
    const rj = await register(e.id, afternoon.id, jean.id)
    const pub = await publishSwapRequest(prisma, { registrationId: rp.id, volunteerId: pierre.id, now: NOW })
    if (!pub.ok) throw new Error(pub.error)
    const offer = await offerSwap(prisma, { requestId: pub.requestId, registrationId: rj.id, volunteerId: jean.id, now: NOW })
    if (!offer.ok) throw new Error(offer.error)
    const { revision } = await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: pub.requestId } })
    const confirmed = await confirmSwap(prisma, { requestId: pub.requestId, volunteerId: pierre.id, revision, now: NOW })
    return { e, morning, afternoon, pierre, jean, rp, rj, requestId: pub.requestId, revision, confirmed }
  }

  it("approving a swap: refused without the acknowledgement of the received shift, the request still waiting; applied with it", async () => {
    const s = await swap(true)
    expect(s.confirmed).toMatchObject({ ok: true, status: "approval" })

    const refused = await decideSwap(db(), { organizationId: orgId, requestId: s.requestId, adminId: "admin-1", approve: true, revision: s.revision, now: NOW })
    expect(refused).toMatchObject({ ok: false, httpStatus: 409, code: "availability", status: "approval", outside: [{ volunteerId: s.pierre.id, shiftId: s.afternoon.id }] })
    expect((await prisma.shiftSwapRequest.findUniqueOrThrow({ where: { id: s.requestId } })).status).toBe("approval")
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: s.rp.id } })).shiftId).toBe(s.morning.id)
    expect(await prisma.eventLog.count({ where: { eventId: s.e.id, action: { in: ["swap.applied", "swap.ended", "registration.availability_acknowledged"] } } })).toBe(0)

    const key = await keyOf(s.e.id, s.pierre.id, s.afternoon.id)
    expect(await decideSwap(db(), { organizationId: orgId, requestId: s.requestId, adminId: "admin-1", approve: true, revision: s.revision, availabilityAck: [key], now: NOW }))
      .toEqual({ ok: true, requestId: s.requestId, status: "applied" })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: s.rp.id } })).shiftId).toBe(s.afternoon.id)
    const applied = await prisma.eventLog.findFirstOrThrow({ where: { eventId: s.e.id, action: "swap.applied" } })
    const entries = await acks(s.e.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entityId: s.rp.id, causedByLogId: applied.id, changes: { shiftId: { from: s.afternoon.id, to: s.afternoon.id }, availabilityAck: { to: { via: "swap" } } } })
  })

  it("a swap the volunteers confirm with no approval is not asked anything: free choice stays immediate", async () => {
    const s = await swap(false)
    expect(s.confirmed).toEqual({ ok: true, requestId: s.requestId, status: "applied" })
    expect(await acks(s.e.id)).toHaveLength(0)
  })
})
