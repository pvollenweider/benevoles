import { describe, it, expect, vi, beforeEach } from "vitest"

// Renaming a poste carries its sector leaders (#1001), in the same transaction as its shifts, its
// share links and its questions. A person already leading a poste of the new name keeps one row,
// the renamed poste's. A refused rename moves nothing; deleting a poste leaves its leaders.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/shift-cancel", () => ({ cancelShift: vi.fn().mockResolvedValue({ cancelledRegistrations: 0, notified: 0, unpublished: false }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api/admin/events/evt-1/roles/Bar", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const params = { params: Promise.resolve({ id: "evt-1", roleName: "Bar" }) }
const roleShift = { id: "s1", colorKey: null, capacity: 2, minVolunteers: null, status: "open", maxPerVolunteer: null, reservedTags: [], overlapAllowed: false, _count: { registrations: 0 } }

function makeModels(leaders: { id: string; email: string; roleName: string }[]) {
  return {
    shift: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    eventGroupLink: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    eventQuestion: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sectorLeader: {
      findMany: vi.fn(async ({ where }: { where: { roleName: string } }) => leaders.filter((l) => l.roleName === where.roleName)),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

let tx: ReturnType<typeof makeModels>
let db: ReturnType<typeof makeModels> & Record<string, unknown>
const $transaction = vi.fn()
const clash = vi.fn()

function setup(leaders: { id: string; email: string; roleName: string }[]) {
  tx = makeModels(leaders)
  db = makeModels([])
  Object.assign(db, {
    event: { findFirst: vi.fn().mockResolvedValue({ id: "evt-1" }) },
    $transaction,
  })
  Object.assign(db.shift, { findMany: vi.fn().mockResolvedValue([roleShift]), findFirst: clash })
  $transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx))
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: { user: { id: "adm-1" } } })
}

describe("PATCH /api/admin/events/[id]/roles/[roleName] — sector leaders follow a rename (#1001)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clash.mockResolvedValue(null)
  })

  it("renames the poste's leader rows inside the rename transaction", async () => {
    setup([{ id: "l1", email: "marc@x.org", roleName: "Bar" }])
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("PATCH", { name: "Buvette" }), params)).status).toBe(200)
    expect($transaction).toHaveBeenCalledTimes(1)
    expect(tx.shift.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { roleName: "Buvette" } }))
    expect(tx.eventQuestion.updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Bar" }, data: { roleName: "Buvette" } })
    expect(tx.sectorLeader.updateMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", roleName: "Bar" }, data: { roleName: "Buvette" } })
    expect(tx.sectorLeader.deleteMany).not.toHaveBeenCalled()
    // Nothing is written outside the transaction.
    expect(db.shift.updateMany).not.toHaveBeenCalled()
    expect(db.sectorLeader.updateMany).not.toHaveBeenCalled()
    expect(logEvent.mock.calls.map((c) => c[0].action)).toEqual(["shift.updated"])
  })

  it("keeps one row per person when the new name already has leaders, and logs the row that gave way", async () => {
    setup([
      { id: "l1", email: "marc@x.org", roleName: "Bar" },
      { id: "l2", email: "Marc@X.org", roleName: "Buvette" },
      { id: "l3", email: "lea@x.org", roleName: "Buvette" },
    ])
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("PATCH", { name: "Buvette" }), params)).status).toBe(200)
    expect(tx.sectorLeader.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["l2"] } } })
    // The duplicate goes before the rename, so the unique (event, poste, email) index never trips.
    expect(tx.sectorLeader.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.sectorLeader.updateMany.mock.invocationCallOrder[0])
    const removed = logEvent.mock.calls.map((c) => c[0]).filter((e) => e.action === "sectorleader.removed")
    expect(removed).toEqual([expect.objectContaining({ entityType: "SectorLeader", entityId: "l2", changes: { roleName: { from: "Buvette", to: null } } })])
  })

  it("moves no leader when the rename is refused because another poste has the name", async () => {
    setup([{ id: "l1", email: "marc@x.org", roleName: "Bar" }])
    clash.mockResolvedValue({ id: "s9" })
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("PATCH", { name: "Buvette" }), params)).status).toBe(409)
    expect($transaction).not.toHaveBeenCalled()
  })

  it("moves no leader on a change that is not a rename", async () => {
    setup([{ id: "l1", email: "marc@x.org", roleName: "Bar" }])
    const { PATCH } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await PATCH(request("PATCH", { name: "Bar", colorKey: null }), params)).status).toBe(200)
    expect($transaction).not.toHaveBeenCalled()
  })

  // #1010: they stay, shown in « Responsables de secteur » as a poste without live shift, and a
  // duplication leaves them out; no row is deleted.
  it("leaves the leaders in place when the poste is deleted", async () => {
    setup([{ id: "l1", email: "marc@x.org", roleName: "Bar" }])
    Object.assign(db.shift, { findMany: vi.fn().mockResolvedValue([{ id: "s1", registrations: [], event: { id: "evt-1" } }]) })
    const { DELETE } = await import("@/app/api/admin/events/[id]/roles/[roleName]/route")
    expect((await DELETE(request("DELETE"), params)).status).toBe(200)
    expect(db.sectorLeader.updateMany).not.toHaveBeenCalled()
    expect(db.sectorLeader.deleteMany).not.toHaveBeenCalled()
  })
})
