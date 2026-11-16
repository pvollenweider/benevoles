import { describe, it, expect, vi, beforeEach } from "vitest"

// POST /api/admin/events/[id]/registrations/bulk (#292): one request for a whole selection,
// all-or-nothing on ownership.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({
  requireOrgSession: requireOrgSessionMock,
  // The day-of and bulk routes ask requireFrontDeskOrOrganizer (#1142): for an organiser it is the
  // same session, marked as such. The front-desk side is tested in security/front-desk-*.test.ts.
  requireFrontDeskOrOrganizer: async () => { const g = await requireOrgSessionMock(); return g instanceof Response ? g : { ...g, access: "organizer", grant: null } },
}))

const actions = vi.hoisted(() => ({
  cancelRegistrations: vi.fn(),
  addSectorLeader: vi.fn(),
  resendManagementLinks: vi.fn(),
  setAttendance: vi.fn(),
}))
vi.mock("@/lib/admin-registration-actions", () => actions)
vi.mock("@/lib/event-log", () => ({ adminActor: () => ({ type: "admin", id: "admin-1" }) }))

const event = { id: "evt-1", title: "Festival", organization: { slug: "a" } }
const reg = (id: string, over: Record<string, unknown> = {}) => ({
  id, eventId: "evt-1", shiftId: "s1", status: "active", checkedInAt: null, editTokenLegacy: `tok-${id}`, editTokenEnc: null,
  volunteer: { id: `v-${id}`, firstName: "A", lastName: id, email: `${id}@x.com` },
  shift: { roleName: "Bar" },
  ...over,
})

let regFindMany: ReturnType<typeof vi.fn>

function post(body: unknown) {
  return new Request("http://localhost/api/admin/events/evt-1/registrations/bulk", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
}
const params = { params: Promise.resolve({ id: "evt-1" }) }

beforeEach(() => {
  vi.clearAllMocks()
  regFindMany = vi.fn()
  requireOrgSessionMock.mockResolvedValue({
    db: { event: { findFirst: vi.fn().mockResolvedValue(event) }, registration: { findMany: regFindMany } },
    organizationId: "org-a",
    session: { user: { id: "admin-1" } },
  })
})

describe("POST /api/admin/events/[id]/registrations/bulk", () => {
  it("does nothing if any id isn't a registration of this event (other org, other event, unknown)", async () => {
    regFindMany.mockResolvedValue([reg("r1")]) // r2 not found through the scoped client
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "cancel", registrationIds: ["r1", "r2"] }), params)
    expect(res.status).toBe(404)
    expect(regFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["r1", "r2"] }, eventId: "evt-1" } }))
    expect(actions.cancelRegistrations).not.toHaveBeenCalled()
  })

  it("rejects an unknown action and an empty selection", async () => {
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    expect((await POST(post({ action: "delete_all", registrationIds: ["r1"] }), params)).status).toBe(400)
    expect((await POST(post({ action: "cancel", registrationIds: [] }), params)).status).toBe(400)
  })

  it("check_in / undo_check_in: hands the rows to setAttendance and reports what changed (#399)", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2")])
    const results = [
      { id: "r1", changed: true, state: "present", checkedInAt: "2026-07-04T08:05:00.000Z" },
      { id: "r2", changed: false, state: "present", checkedInAt: "2026-07-04T08:01:00.000Z" },
    ]
    actions.setAttendance.mockResolvedValue(results)
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "check_in", registrationIds: ["r1", "r2"] }), params)
    expect(res.status).toBe(200)
    expect(actions.setAttendance).toHaveBeenCalledWith(expect.anything(), expect.anything(), [expect.objectContaining({ id: "r1" }), expect.objectContaining({ id: "r2" })], "check_in")
    const body = await res.json()
    // What existing callers read (#399) is still there, unchanged.
    expect(body).toMatchObject({ done: 1, changedIds: ["r1"], skipped: 1 })
    // And the state of every requested registration after the call (#1141).
    expect(body).toEqual({ done: 1, changedIds: ["r1"], skipped: 1, results })
    regFindMany.mockResolvedValue([reg("r1")])
    actions.setAttendance.mockResolvedValue([{ id: "r1", changed: true, state: "expected", checkedInAt: null }])
    await POST(post({ action: "undo_check_in", registrationIds: ["r1"] }), params)
    expect(actions.setAttendance).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), "undo_check_in")
  })

  it("mark_absent / undo_absent: the same path as the check-in, with the per-registration results (#1141)", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2"), reg("r3", { status: "waiting" })])
    const results = [
      { id: "r1", changed: true, state: "absent", checkedInAt: null },
      // Marked present meanwhile on another device: nothing changed, the truth comes back.
      { id: "r2", changed: false, state: "present", checkedInAt: "2026-07-04T08:01:00.000Z" },
      { id: "r3", changed: false, state: "expected", checkedInAt: null },
    ]
    actions.setAttendance.mockResolvedValue(results)
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "mark_absent", registrationIds: ["r1", "r2", "r3"] }), params)
    expect(res.status).toBe(200)
    // Every row of the selection is handed over with its status: setAttendance skips the inactive ones.
    expect(actions.setAttendance).toHaveBeenCalledWith(
      expect.anything(), { type: "admin", id: "admin-1" },
      [expect.objectContaining({ id: "r1", status: "active" }), expect.objectContaining({ id: "r2" }), expect.objectContaining({ id: "r3", status: "waiting" })],
      "mark_absent",
    )
    expect(await res.json()).toEqual({ done: 1, changedIds: ["r1"], skipped: 2, results })

    regFindMany.mockResolvedValue([reg("r1")])
    actions.setAttendance.mockResolvedValue([{ id: "r1", changed: true, state: "expected", checkedInAt: null }])
    const undo = await POST(post({ action: "undo_absent", registrationIds: ["r1"] }), params)
    expect(actions.setAttendance).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), "undo_absent")
    expect(await undo.json()).toEqual({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "expected", checkedInAt: null }] })
  })

  it("hands each registration over with the shift the route read and the one the page showed (`observedShifts`, #1141)", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2", { shiftId: "s2" })])
    actions.setAttendance.mockResolvedValue([
      { id: "r1", changed: true, state: "present", checkedInAt: "2026-07-04T08:05:00.000Z" },
      { id: "r2", changed: false, state: "expected", checkedInAt: null, moved: true },
    ])
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "check_in", registrationIds: ["r1", "r2"], observedShifts: { r1: "s1", r2: "s1", other: "s7" } }), params)
    expect(actions.setAttendance.mock.calls[0][2]).toEqual([
      { id: "r1", eventId: "evt-1", shiftId: "s1", status: "active", checkedInAt: null, observedShiftId: "s1" },
      { id: "r2", eventId: "evt-1", shiftId: "s2", status: "active", checkedInAt: null, observedShiftId: "s1" },
    ])
    // `moved` reaches the client; the counters of #399 are unchanged.
    expect(await res.json()).toMatchObject({ done: 1, changedIds: ["r1"], skipped: 1, results: [{ id: "r1" }, { id: "r2", changed: false, moved: true }] })
  })

  it("a caller that sends no `observedShifts` keeps working: no observed shift is handed over", async () => {
    regFindMany.mockResolvedValue([reg("r1")])
    actions.setAttendance.mockResolvedValue([{ id: "r1", changed: true, state: "absent", checkedInAt: null }])
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    expect((await POST(post({ action: "mark_absent", registrationIds: ["r1"] }), params)).status).toBe(200)
    expect(actions.setAttendance.mock.calls[0][2]).toEqual([{ id: "r1", eventId: "evt-1", shiftId: "s1", status: "active", checkedInAt: null, observedShiftId: null }])
  })

  it("passes a « gone » result on as it is", async () => {
    regFindMany.mockResolvedValue([reg("r1")])
    actions.setAttendance.mockResolvedValue([{ id: "r1", changed: false, state: null, checkedInAt: null, gone: true }])
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "mark_absent", registrationIds: ["r1"] }), params)
    expect(await res.json()).toEqual({ done: 0, changedIds: [], skipped: 1, results: [{ id: "r1", changed: false, state: null, checkedInAt: null, gone: true }] })
  })

  it("the absence actions need the same ownership as the check-in: one foreign id and nothing is done (#1141)", async () => {
    regFindMany.mockResolvedValue([reg("r1")]) // r2 not found through the scoped client
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    for (const action of ["mark_absent", "undo_absent"]) {
      expect((await POST(post({ action, registrationIds: ["r1", "r2"] }), params)).status).toBe(404)
    }
    expect(actions.setAttendance).not.toHaveBeenCalled()
  })

  it("refuses « left_early » as an action name and any other unknown attendance action (#1141)", async () => {
    regFindMany.mockResolvedValue([reg("r1")])
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    for (const action of ["left_early", "absent", "mark_present", "undo_departure"]) {
      expect((await POST(post({ action, registrationIds: ["r1"] }), params)).status, action).toBe(400)
    }
    expect(regFindMany).not.toHaveBeenCalled()
    expect(actions.setAttendance).not.toHaveBeenCalled()
  })

  it("mark_left_early / undo_left_early: the same path, carrying the arrival the route read (#1141)", async () => {
    const arrived = "2026-07-04T08:05:00.000Z"
    regFindMany.mockResolvedValue([reg("r1", { checkedInAt: new Date(arrived) })])
    const results = [{ id: "r1", changed: true, state: "left_early", checkedInAt: arrived }]
    actions.setAttendance.mockResolvedValue(results)
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "mark_left_early", registrationIds: ["r1"], observedShifts: { r1: "s1" } }), params)
    expect(res.status).toBe(200)
    expect(actions.setAttendance).toHaveBeenCalledWith(
      expect.anything(), { type: "admin", id: "admin-1" },
      [{ id: "r1", eventId: "evt-1", shiftId: "s1", status: "active", checkedInAt: new Date(arrived), observedShiftId: "s1" }],
      "mark_left_early",
    )
    expect(await res.json()).toEqual({ done: 1, changedIds: ["r1"], skipped: 0, results })

    actions.setAttendance.mockResolvedValue([{ id: "r1", changed: true, state: "present", checkedInAt: arrived }])
    const undo = await POST(post({ action: "undo_left_early", registrationIds: ["r1"] }), params)
    expect(actions.setAttendance).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.anything(), "undo_left_early")
    expect(await undo.json()).toEqual({ done: 1, changedIds: ["r1"], skipped: 0, results: [{ id: "r1", changed: true, state: "present", checkedInAt: arrived }] })
  })

  it("cancel: only active rows, duplicates in the selection counted once", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2", { status: "cancelled" })])
    actions.cancelRegistrations.mockResolvedValue(["r1"])
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "cancel", registrationIds: ["r1", "r2", "r1"] }), params)
    expect(res.status).toBe(200)
    expect(actions.cancelRegistrations).toHaveBeenCalledWith(expect.anything(), expect.anything(), [expect.objectContaining({ id: "r1" })])
    expect(await res.json()).toEqual({ done: 1, cancelledIds: ["r1"], skipped: 1 })
  })

  it("make_leader: one leader per (role, email), rows without email skipped", async () => {
    regFindMany.mockResolvedValue([
      reg("r1"),
      reg("r2", { volunteer: { id: "v-r1", firstName: "A", lastName: "r1", email: "r1@x.com" } }), // same person, same role
      reg("r3", { volunteer: { id: "v-r3", firstName: "C", lastName: "r3", email: null } }),
    ])
    actions.addSectorLeader.mockResolvedValue({ status: "created" })
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "make_leader", registrationIds: ["r1", "r2", "r3"] }), params)
    expect(actions.addSectorLeader).toHaveBeenCalledTimes(1)
    expect(await res.json()).toEqual({ done: 1, alreadyLeader: 0, skipped: 1 })
  })

  it("resend_link: only active rows are passed on", async () => {
    regFindMany.mockResolvedValue([reg("r1"), reg("r2", { status: "waiting" })])
    actions.resendManagementLinks.mockResolvedValue({ sent: 1, failed: 0, skipped: 0 })
    const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
    const res = await POST(post({ action: "resend_link", registrationIds: ["r1", "r2"] }), params)
    expect(actions.resendManagementLinks.mock.calls[0][0]).toHaveLength(1)
    expect(await res.json()).toEqual({ done: 1, failed: 0, skipped: 1 })
  })
})
