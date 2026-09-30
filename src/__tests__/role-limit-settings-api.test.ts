import { describe, it, expect, vi } from "vitest"

// Setting the limit of shifts per volunteer on a role (#466): applied to all its shifts, logged.
const { updateMany, logEvent, db } = vi.hoisted(() => {
  const updateMany = vi.fn().mockResolvedValue({ count: 2 })
  const logEvent = vi.fn()
  const db = {
  event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) },
  shift: {
    findMany: vi.fn().mockResolvedValue([
      { id: "s1", colorKey: null, capacity: 5, status: "open", maxPerVolunteer: null, _count: { registrations: 0 } },
      { id: "s2", colorKey: null, capacity: 5, status: "open", maxPerVolunteer: null, _count: { registrations: 0 } },
    ]),
    updateMany,
  },
  }
  return { updateMany, logEvent, db }
})
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn() }))
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: async () => ({ db, organizationId: "org-a", session: { user: { id: "adm" } } }) }))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm" }) }))

const patch = (body: unknown) => new Request("http://localhost/api/admin/events/evt-1/roles/Loge", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-1", roleName: "Loge" }) }

describe("PATCH /api/admin/events/[id]/roles/[roleName] — maxPerVolunteer", () => {
  it("sets the limit on every shift of the role and logs each change", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    const res = await PATCH(patch({ maxPerVolunteer: 2 }), params)
    expect(res.status).toBe(200)
    expect(updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Loge", event: { organizationId: "org-a" } }, data: { maxPerVolunteer: 2 } })
    expect(logEvent).toHaveBeenCalledTimes(2)
    expect(logEvent.mock.calls[0][0].changes).toEqual({ maxPerVolunteer: { from: null, to: 2 } })
  })

  it("removes it with null and refuses nonsense", async () => {
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(patch({ maxPerVolunteer: null }), params)).status).toBe(200)
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: { maxPerVolunteer: null } }))
    expect((await PATCH(patch({ maxPerVolunteer: 0 }), params)).status).toBe(400)
    expect((await PATCH(patch({ maxPerVolunteer: 1.5 }), params)).status).toBe(400)
  })
})
