// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * Organiser shortcuts that used to skip business rules (AUTHZ-15), against a real Postgres:
 * - a shift cancelled by its status cancels its registrations and pending requests and emails the
 *   people through the outbox (one email each, no real email leaves), unless the organiser chose
 *   « Ne pas prévenir les inscrits »; the choice is logged; reopening tells nobody;
 * - a manual add on a full shift needs the confirmation read under the shift lock, a cancelled
 *   shift refuses it.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"
import { generateToken } from "@/lib/utils"
import { registrationToken } from "@/lib/token-vault"
import { openPayload } from "@/lib/notifications/outbox"

const url = process.env.DATABASE_URL
const tag = `int-org-guards-${Date.now()}`

describe.skipIf(!url)("organiser shift guards on Postgres (AUTHZ-15)", () => {
  let orgId = ""
  let eventId = ""
  let n = 0

  beforeAll(async () => {
    orgId = (await prisma.organization.create({ data: { name: `Asso ${tag}`, slug: tag, timeZone: "Europe/Zurich" } })).id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "admin-1", email: `${tag}-admin@example.org` } } }
    eventId = (await prisma.event.create({ data: { organizationId: orgId, slug: `${tag}-e`, title: "Fête du village", publicStatus: "draft", startDate: new Date("2099-07-04"), endDate: new Date("2099-07-06") } })).id
  })

  afterAll(async () => {
    if (orgId) {
      await prisma.notificationOutbox.deleteMany({ where: { organizationId: orgId } })
      await prisma.event.deleteMany({ where: { organizationId: orgId } })
      await prisma.volunteer.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } })
    }
    await prisma.$disconnect()
  })

  async function shiftWith(people: { firstName: string; status: string }[], capacity = 5) {
    const shift = await prisma.shift.create({ data: { eventId, roleName: "Bar", label: "Bar", date: new Date("2099-07-04T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity } })
    const regs = []
    for (const p of people) {
      const v = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: p.firstName, lastName: "Rochat", email: `${tag}-${p.firstName.toLowerCase()}-${n++}@example.org` } })
      regs.push(await prisma.registration.create({ data: { eventId, shiftId: shift.id, volunteerId: v.id, status: p.status, ...registrationToken.data(generateToken()) } }))
    }
    return { shift, regs }
  }

  const patch = async (id: string, body: unknown) => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    return PATCH(new Request(`http://localhost/api/admin/shifts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
  }
  const outboxFor = (regIds: string[]) => prisma.notificationOutbox.findMany({ where: { organizationId: orgId, dedupeKey: { in: regIds.map((id) => `shift_cancelled:${id}`) } } })

  it("cancelling by the status cancels places and requests and queues one cancellation email each", async () => {
    // A fourth shift keeps the event from losing its last live shift.
    await shiftWith([])
    const { shift, regs } = await shiftWith([{ firstName: "Emma", status: "active" }, { firstName: "Luca", status: "requested" }, { firstName: "Nadia", status: "waiting" }])
    const res = await patch(shift.id, { status: "cancelled" })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: "cancelled", notified: 2, cancelledRegistrations: 2 })

    const rows = await prisma.registration.findMany({ where: { shiftId: shift.id }, orderBy: { createdAt: "asc" }, select: { status: true } })
    expect(rows.map((r) => r.status)).toEqual(["cancelled", "cancelled", "waiting"])
    const queued = await outboxFor(regs.map((r) => r.id))
    expect(queued).toHaveLength(2)
    // Sealed at rest when a token key is configured: opened as the sender does.
    expect(queued.map((q) => openPayload(q.payload).kind)).toEqual(["shift_cancelled", "shift_cancelled"])
    const log = await prisma.eventLog.findFirst({ where: { eventId, entityId: shift.id, action: "shift.cancelled" } })
    expect(log?.changes).toMatchObject({ volunteersNotified: { from: null, to: true } })
    // The request is recorded as a request: « Rétablir » gives it back as one.
    const requestLog = await prisma.eventLog.findFirst({ where: { eventId, entityId: regs[1].id, action: "registration.cancelled" } })
    expect(requestLog?.changes).toMatchObject({ status: { from: "requested", to: "cancelled" } })
  })

  it("« Ne pas prévenir les inscrits »: the registrations are cancelled, nothing is queued, the choice is logged", async () => {
    const { shift, regs } = await shiftWith([{ firstName: "Chloé", status: "active" }])
    const res = await patch(shift.id, { status: "cancelled", notifyVolunteers: false })
    expect(await res.json()).toMatchObject({ notified: 0, cancelledRegistrations: 1 })
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: regs[0].id } })).status).toBe("cancelled")
    expect(await outboxFor([regs[0].id])).toHaveLength(0)
    const log = await prisma.eventLog.findFirst({ where: { eventId, entityId: shift.id, action: "shift.cancelled" } })
    expect(log?.changes).toMatchObject({ volunteersNotified: { from: null, to: false } })
  })

  it("reopening tells nobody and gives no place back", async () => {
    const { shift, regs } = await shiftWith([{ firstName: "Marc", status: "active" }])
    await patch(shift.id, { status: "cancelled", notifyVolunteers: false })
    const before = await prisma.notificationOutbox.count({ where: { organizationId: orgId } })
    expect((await patch(shift.id, { status: "open" })).status).toBe(200)
    expect(await prisma.notificationOutbox.count({ where: { organizationId: orgId } })).toBe(before)
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: regs[0].id } })).status).toBe("cancelled")
  })

  it("a manual add on a full shift needs the confirmation, judged under the lock; a cancelled shift refuses it", async () => {
    const { shift } = await shiftWith([{ firstName: "Sofia", status: "active" }], 1)
    const member = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Jonas", lastName: "Meier", email: `${tag}-jonas@example.org` } })
    const { POST } = await import("@/app/api/admin/registrations/route")
    const add = (extra: Record<string, unknown> = {}) => POST(new Request("http://localhost/api/admin/registrations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, volunteerId: member.id, shiftIds: [shift.id], ...extra }),
    }))
    const refused = await add()
    expect(refused.status).toBe(409)
    const body = await refused.json()
    expect(body).toMatchObject({ code: "shift_override", shifts: [{ shiftId: shift.id, full: true, occupied: 1, capacity: 1 }] })
    expect(await prisma.registration.count({ where: { shiftId: shift.id, volunteerId: member.id } })).toBe(0)

    const added = await add({ shiftOverride: [body.shifts[0].key] })
    expect(added.status).toBe(201)
    const log = await prisma.eventLog.findFirst({ where: { eventId, action: "registration.created", entityType: "Registration" }, orderBy: { createdAt: "desc" } })
    expect(log?.changes).toMatchObject({ shiftOverride: { from: null, to: "complet, 2 sur 1" } })

    await prisma.shift.update({ where: { id: shift.id }, data: { status: "cancelled" } })
    const other = await prisma.volunteer.create({ data: { organizationId: orgId, firstName: "Léa", lastName: "Favre" } })
    const onCancelled = await POST(new Request("http://localhost/api/admin/registrations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, volunteerId: other.id, shiftIds: [shift.id] }),
    }))
    expect(onCancelled.status).toBe(409)
    expect((await onCancelled.json()).code).toBe("shift_cancelled")
  })
})
