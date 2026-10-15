import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

/**
 * « Cumulable avec un autre créneau » (#986) against a real Postgres: the option is set on every
 * shift of the role, follows a rename, is taken by a shift added to the role, and does not come
 * back for a role deleted and then recreated under the same name.
 */

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ sendNotification: vi.fn().mockResolvedValue({ ok: true }) }))
const guard = vi.hoisted(() => ({ value: null as unknown }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => guard.value }))

import { prisma } from "@/lib/prisma"
import { getOrgClient } from "@/lib/prisma-org"

const url = process.env.DATABASE_URL
const tag = `int-overlap-${Date.now()}`

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost${path}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

describe.skipIf(!url)("role overlap option (#986)", () => {
  let orgId = ""
  let eventId = ""

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: "Org overlap", slug: `${tag}-org` } })
    orgId = org.id
    guard.value = { db: getOrgClient(orgId), organizationId: orgId, session: { user: { id: "adm-test", email: "adm@example.org" } } }
    const event = await prisma.event.create({
      data: { organizationId: orgId, slug: "fete", title: "Fête", startDate: new Date("2030-06-01"), endDate: new Date("2030-06-02") },
    })
    eventId = event.id
    const base = { eventId, roleName: "Secours", label: "Secours", date: new Date("2030-06-01"), capacity: 2 }
    await prisma.shift.create({ data: { ...base, startTime: "09:00", endTime: "13:00" } })
    await prisma.shift.create({ data: { ...base, startTime: "13:00", endTime: "17:00", status: "cancelled" } })
    await prisma.shift.create({ data: { ...base, roleName: "Buvette", label: "Buvette", startTime: "10:00", endTime: "14:00" } })
  })

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.$disconnect()
  })

  const values = async (roleName: string) =>
    (await prisma.shift.findMany({ where: { eventId, roleName }, select: { overlapAllowed: true } })).map((s) => s.overlapAllowed)

  it("sets the option on every shift of the role only, cancelled ones included", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(request(`/api/admin/events/${eventId}/roles/Secours`, "PATCH", { overlapAllowed: true }), { params: Promise.resolve({ id: eventId, roleName: "Secours" }) })
    expect(res.status).toBe(200)
    expect(await values("Secours")).toEqual([true, true])
    expect(await values("Buvette")).toEqual([false])
  })

  it("gives it to a shift added to the role, and keeps it on rename", async () => {
    const { POST } = await import("@/app/api/admin/shifts/route")
    const created = await POST(request("/api/admin/shifts", "POST", { eventId, roleName: "Secours", label: "Secours", date: "2030-06-02", startTime: "09:00", endTime: "12:00", capacity: 1 }))
    expect(created.status).toBe(201)
    expect((await created.json()).overlapAllowed).toBe(true)

    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const renamed = await PATCH(request(`/api/admin/events/${eventId}/roles/Secours`, "PATCH", { name: "Premiers secours" }), { params: Promise.resolve({ id: eventId, roleName: "Secours" }) })
    expect(renamed.status).toBe(200)
    expect(await values("Premiers secours")).toEqual([true, true, true])
    expect(await values("Secours")).toEqual([])
  })

  it("does not bring it back for a role deleted then recreated under the same name", async () => {
    const { DELETE } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const deleted = await DELETE(request(`/api/admin/events/${eventId}/roles/Premiers%20secours`, "DELETE"), { params: Promise.resolve({ id: eventId, roleName: "Premiers secours" }) })
    expect(deleted.status).toBe(200)

    const { POST } = await import("@/app/api/admin/shifts/route")
    const created = await POST(request("/api/admin/shifts", "POST", { eventId, roleName: "Premiers secours", label: "Premiers secours", date: "2030-06-01", startTime: "09:00", endTime: "12:00", capacity: 1 }))
    expect((await created.json()).overlapAllowed).toBe(false)
  })
})
