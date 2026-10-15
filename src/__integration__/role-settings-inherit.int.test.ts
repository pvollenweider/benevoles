import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * The settings of a poste (#1002) against a real Postgres: a shift created in an existing poste
 * (single, series, recurring permanence, duplicate) or moved to one takes its colour, limit per
 * volunteer, reserved access, cumulable option and order, read from its live shifts only; the
 * poste's existing shifts are never rewritten.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"

const url = process.env.DATABASE_URL
const tag = `int-role-settings-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

const POSTE = { colorKey: "teal", maxPerVolunteer: 2, reservedTags: ["sécurité"], overlapAllowed: true, displayOrder: 300 }
const pick = (s: Record<string, unknown>) => ({
  colorKey: s.colorKey, maxPerVolunteer: s.maxPerVolunteer, reservedTags: s.reservedTags, overlapAllowed: s.overlapAllowed, displayOrder: s.displayOrder,
})

describe.skipIf(!url)("poste settings on new shifts (#1002)", () => {
  let eventId = ""
  let buvetteId = ""
  let staleId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org role settings", slug: `${tag}-org` } })
    guard.value = { db: getOrgClient(org.id), organizationId: org.id, session: { user: { id: "adm-test", email: "adm@example.org" } } }
    const event = await prisma.event.create({
      data: { organizationId: org.id, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-30") },
    })
    eventId = event.id
    const base = { eventId, roleName: "Sécurité", label: "Sécurité", date: new Date("2030-06-01"), capacity: 2 }
    await prisma.shift.create({ data: { ...base, ...POSTE, startTime: "09:00", endTime: "11:00" } })
    await prisma.shift.create({ data: { ...base, ...POSTE, startTime: "11:00", endTime: "13:00" } })
    // A cancelled shift with other values is not read.
    await prisma.shift.create({ data: { ...base, startTime: "13:00", endTime: "15:00", status: "cancelled", colorKey: "rose", maxPerVolunteer: 1, displayOrder: 0 } })
    // A shift added before #1002, without the poste's settings.
    staleId = (await prisma.shift.create({ data: { ...base, startTime: "15:00", endTime: "17:00", displayOrder: 300, overlapAllowed: true } })).id
    buvetteId = (await prisma.shift.create({
      data: { ...base, roleName: "Buvette", label: "Buvette", startTime: "10:00", endTime: "12:00", colorKey: "rose", maxPerVolunteer: 5, reservedTags: ["bar"] },
    })).id
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  const poste = async (roleName: string, where: object = {}) =>
    (await prisma.shift.findMany({ where: { eventId, roleName, ...where }, orderBy: { createdAt: "asc" } })).map(pick)

  it("a single shift takes the poste's settings, the stale shift's missing ones not winning", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const res = await POST(request("/api/admin/shifts", "POST", { eventId, roleName: "Sécurité", label: "Sécurité", date: "2030-06-02", startTime: "09:00", endTime: "12:00", capacity: 1 }))
    expect(res.status).toBe(201)
    expect(pick(await res.json())).toEqual(POSTE)
  })

  it("a series and a recurring permanence take them on every shift", async () => {
    const series = await import("@/app/api/admin/shifts/series/route")
    const s = await series.POST(request("/api/admin/shifts/series", "POST", { eventId, roleName: "Sécurité", date: "2030-06-03", startTime: "10:00", endTime: "14:00", slotMinutes: 120, capacity: 1 }))
    expect(s.status).toBe(201)
    for (const shift of await s.json()) expect(pick(shift)).toEqual(POSTE)

    const recurrence = await import("@/app/api/admin/shifts/recurrence/route")
    const r = await recurrence.POST(request("/api/admin/shifts/recurrence", "POST", {
      eventId, roleName: "Sécurité", from: "2030-06-10", until: "2030-06-24", weekdays: [1], everyWeeks: 1,
      startTime: "18:00", endTime: "20:00", slotMinutes: 120, capacity: 1, holidays: "none",
    }))
    expect(r.status).toBe(201)
    const { shifts } = await r.json()
    expect(shifts.length).toBe(3)
    for (const shift of shifts) expect(pick(shift)).toEqual(POSTE)
  })

  it("a shift moved to the poste takes them, a duplicate of a stale shift too", async () => {
    const { PATCH } = await import("@/app/api/admin/shifts/[id]/route")
    const moved = await PATCH(request(`/api/admin/shifts/${buvetteId}`, "PATCH", { roleName: "Sécurité", displayOrder: 0 }), { params: Promise.resolve({ id: buvetteId }) })
    expect(moved.status).toBe(200)
    expect(pick(await moved.json())).toEqual(POSTE)

    const { POST } = await import("@/app/api/admin/shifts/[id]/duplicate/route")
    const copy = await POST(request(`/api/admin/shifts/${staleId}/duplicate`, "POST"), { params: Promise.resolve({ id: staleId }) })
    expect(copy.status).toBe(201)
    expect(pick(await copy.json())).toEqual(POSTE)
  })

  it("leaves the poste's existing shifts as they were", async () => {
    const stale = await prisma.shift.findUniqueOrThrow({ where: { id: staleId } })
    expect(pick(stale)).toEqual({ colorKey: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed: true, displayOrder: 300 })
    expect(await poste("Sécurité", { status: "cancelled" })).toEqual([{ colorKey: "rose", maxPerVolunteer: 1, reservedTags: [], overlapAllowed: false, displayOrder: 0 }])
  })

  it("a shift in a new poste keeps the defaults", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const res = await POST(request("/api/admin/shifts", "POST", { eventId, roleName: "Accueil", label: "Accueil", date: "2030-06-02", startTime: "09:00", endTime: "12:00", capacity: 1, displayOrder: 500 }))
    expect(pick(await res.json())).toEqual({ colorKey: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, displayOrder: 500 })
  })
})
