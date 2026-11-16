// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Assisted manual assignment (#1146, lot B) against a real Postgres: the per-shift panel's
 * candidates (scope, people already on the shift, inactive members, other organisations), the
 * manual add's acknowledgement (refused without it, nothing created; accepted with the key the
 * form received, its evidence written with the registration; stale once the answer changed), and the lock order: an organiser's correction
 * that holds the person's row makes a waiting addition read the new answer. Only email is mocked.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { loadPersonFits, loadShiftAssist } from "@/lib/availability-assist-data"
import { POST as manualAdd } from "@/app/api/admin/registrations/route"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"

const url = process.env.DATABASE_URL
const tag = `int-assist-${Date.now()}`
const TZ = "Europe/Zurich"

describe.skipIf(!url)("assisted manual assignment on Postgres (#1146, lot B)", () => {
  let orgId = ""
  let otherOrgId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: TZ } })).id
    otherOrgId = (await prisma.organization.create({ data: { name: `Autre ${tag}`, slug: `${tag}-b`, timeZone: TZ } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "admin-1", email: `${tag}-admin@example.org` } } }
  })

  afterAll(async () => {
    for (const id of [orgId, otherOrgId].filter(Boolean)) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: id } })
      await prisma.event.deleteMany({ where: { organizationId: id } })
      await prisma.volunteer.deleteMany({ where: { organizationId: id } })
    }
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  const event = (inUse = true) => prisma.event.create({
    data: {
      organizationId: orgId, slug: `f-${++n}`, title: "Festival", startDate: new Date("2031-07-10"), endDate: new Date("2031-07-12"),
      ...(inUse ? { availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: TZ } : {}),
    },
  })
  const shift = (eventId: string, date: string, start: string, end: string, roleName = "Bar") =>
    prisma.shift.create({ data: { eventId, roleName, label: roleName, date: new Date(date), startTime: start, endTime: end, capacity: 4 } })
  const member = (lastName: string, extra: Record<string, unknown> = {}) =>
    prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Nadia", lastName, email: null, ...extra } })
  const answer = (eventId: string, volunteerId: string, days: { date: string; ranges: { start: string; end: string }[] }[]) =>
    prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId, volunteerId, days, by: "admin" }))
  const add = (body: Record<string, unknown>) => manualAdd(new Request("http://localhost/api/admin/registrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
  const db = () => getOrgClient(orgId)

  it("lists the people asked or already on a mission, apart from those on the shift, inactive or of another organisation", async () => {
    const e = await event()
    const bar = await shift(e.id, "2031-07-11", "14:00", "20:00")
    const morning = await shift(e.id, "2031-07-11", "08:00", "14:00", "Loge")
    const asked = await member("Rochat")
    await answer(e.id, asked.id, [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [{ start: "09:00", end: "12:00" }] }])
    const busy = await member("Favre")
    await prisma.registration.create({ data: { eventId: e.id, shiftId: morning.id, volunteerId: busy.id, status: "active", source: "admin_manual", ...registrationToken.data(generateToken()) } })
    const already = await member("Bonvin")
    await prisma.registration.create({ data: { eventId: e.id, shiftId: bar.id, volunteerId: already.id, status: "waiting", source: "admin_manual", ...registrationToken.data(generateToken()) } })
    await answer(e.id, already.id, [{ date: "2031-07-11", ranges: [] }])
    const unrelated = await member("Meyer")
    const inactive = await member("Perrin", { active: false })
    await prisma.availabilityRequest.create({ data: { eventId: e.id, volunteerId: inactive.id } })
    await prisma.volunteer.create({ data: { organizationId: otherOrgId, firstName: "Ana", lastName: "Gerber" } })

    const panel = await loadShiftAssist(db(), e.id, bar.id, "event")
    expect(panel?.alreadyOnShift).toBe(1)
    const byName = new Map(panel!.rows.map((r) => [r.lastName, r]))
    expect([...byName.keys()].sort()).toEqual(["Favre", "Rochat"])
    expect(byName.get("Rochat")).toMatchObject({ fit: { state: "outside", needsAck: true } })
    expect(byName.get("Favre")).toMatchObject({ fit: { state: "unknown" }, backToBack: ["Loge"], minutes: { confirmed: 360, committed: 360 } })

    const all = await loadShiftAssist(db(), e.id, bar.id, "all")
    expect(all!.rows.map((r) => r.lastName)).toContain("Meyer")
    expect(all!.rows.map((r) => r.lastName)).not.toContain("Gerber")
    expect(all!.rows.map((r) => r.volunteerId)).not.toContain(inactive.id)
    expect(all!.rows.map((r) => r.volunteerId)).toContain(unrelated.id)

    // Another organisation's client sees nothing of it.
    expect(await loadShiftAssist(getOrgClient(otherOrgId), e.id, bar.id, "event")).toBeNull()
  })

  it("needs the acknowledgement outside declared availability, accepts the form's key and logs it", async () => {
    const e = await event()
    const bar = await shift(e.id, "2031-07-11", "14:00", "20:00")
    const p = await member("Morel")
    await answer(e.id, p.id, [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [{ start: "09:00", end: "15:00" }] }])

    const refused = await add({ eventId: e.id, volunteerId: p.id, shiftIds: [bar.id] })
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: "availability", outside: [{ shiftId: bar.id, state: "partial" }] })
    expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)

    const fits = await loadPersonFits(db(), e.id, p.id, [bar.id])
    const key = fits!.fits[0].ackKey!
    const added = await add({ eventId: e.id, volunteerId: p.id, shiftIds: [bar.id], availabilityAck: [key] })
    expect(added.status).toBe(201)
    // The evidence, committed with the registration (#1146, lot B follow-up): one entry, versioned.
    const log = await prisma.eventLog.findFirst({ where: { eventId: e.id, action: "registration.availability_acknowledged" } })
    expect(log?.changes).toMatchObject({ availabilityAck: { to: { v: 1, via: "manual_add", state: "partial", coveredMinutes: 60, outsideMinutes: 300 } } })
  })

  it("an addition waiting behind a correction of the same person reads the new answer: the old acknowledgement no longer applies", async () => {
    const e = await event()
    const bar = await shift(e.id, "2031-07-11", "14:00", "20:00")
    const p = await member("Blanc")
    await answer(e.id, p.id, [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [] }])
    const key = (await loadPersonFits(db(), e.id, p.id, [bar.id]))!.fits[0].ackKey!

    let corrected!: () => void
    const holding = new Promise<void>((r) => { corrected = r })
    const correction = prisma.$transaction(async (tx) => {
      // Holds the person's row (saveAvailabilityAnswers locks it), then lets the addition start.
      await saveAvailabilityAnswers(tx, { eventId: e.id, volunteerId: p.id, days: [{ date: "2031-07-11", ranges: [{ start: "18:00", end: "19:00" }] }], by: "admin" })
      corrected()
      await new Promise((r) => setTimeout(r, 500))
    }, { timeout: 10_000 })
    await holding
    const res = await add({ eventId: e.id, volunteerId: p.id, shiftIds: [bar.id], availabilityAck: [key] })
    await correction
    expect(res.status).toBe(409)
    expect(await prisma.registration.count({ where: { eventId: e.id } })).toBe(0)
  })

  it("leaves an event without the option unchanged", async () => {
    const e = await event(false)
    const bar = await shift(e.id, "2031-07-11", "14:00", "20:00")
    const p = await member("Muller")
    expect((await add({ eventId: e.id, volunteerId: p.id, shiftIds: [bar.id] })).status).toBe(201)
    expect(await loadShiftAssist(db(), e.id, bar.id, "event")).toBeNull()
    expect(await loadPersonFits(db(), e.id, p.id, [bar.id])).toEqual({ inUse: false, fits: [] })
  })
})
