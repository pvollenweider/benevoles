import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.hoisted(() => vi.fn())
const groupBy = vi.hoisted(() => vi.fn())
const adminFindMany = vi.hoisted(() => vi.fn())
const volunteerFindMany = vi.hoisted(() => vi.fn())
const shiftFindMany = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({
  prisma: {
    eventLog: { findMany, groupBy },
    adminUser: { findMany: adminFindMany },
    volunteer: { findMany: volunteerFindMany },
    shift: { findMany: shiftFindMany },
  },
}))

import { listEventLogs, getCausalChain, listReplayCandidates, listStoryCandidates } from "../event-log-read"

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "log-1",
  eventId: "evt-1",
  actorType: "admin",
  actorId: "admin-1",
  action: "shift.created",
  entityType: "Shift",
  entityId: "shift-1",
  changes: { capacity: { from: 3, to: 4 } },
  causedByLogId: null,
  createdAt: new Date("2026-09-22T10:00:00.000Z"),
  ...overrides,
})

describe("listEventLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminFindMany.mockResolvedValue([{ id: "admin-1", name: "Alice" }])
    volunteerFindMany.mockResolvedValue([])
    shiftFindMany.mockResolvedValue([])
  })

  it("scopes the query to the given event", async () => {
    findMany.mockResolvedValue([row()])
    await listEventLogs("evt-1", {})
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ eventId: "evt-1" }) }),
    )
  })

  it("resolves the actor's current display name via a live join", async () => {
    findMany.mockResolvedValue([row()])
    const { entries } = await listEventLogs("evt-1", {})
    expect(entries[0].actorLabel).toBe("Alice")
  })

  it("falls back to a generic label when the actor record is gone", async () => {
    adminFindMany.mockResolvedValue([]) // admin removed
    findMany.mockResolvedValue([row()])
    const { entries } = await listEventLogs("evt-1", {})
    expect(entries[0].actorLabel).toBe("Admin (compte supprimé)")
  })

  it("uses a generic system label without attempting a join", async () => {
    findMany.mockResolvedValue([row({ actorType: "system", actorId: null })])
    const { entries } = await listEventLogs("evt-1", {})
    expect(entries[0].actorLabel).toBe("Système")
    expect(adminFindMany).not.toHaveBeenCalled()
  })

  it("filters by action prefix so 'shift' matches shift.created and shift.updated", async () => {
    findMany.mockResolvedValue([])
    await listEventLogs("evt-1", { action: "shift" })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ action: { startsWith: "shift" } }) }),
    )
  })

  it("paginates: requests one extra row to detect more pages, and returns a cursor", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => row({ id: `log-${i}` }))
    findMany.mockResolvedValue(rows)
    const { entries, nextCursor } = await listEventLogs("evt-1", { limit: 50 })
    expect(entries).toHaveLength(50)
    expect(nextCursor).toBe("log-49")
  })

  it("returns no cursor when there is no further page", async () => {
    findMany.mockResolvedValue([row()])
    const { nextCursor } = await listEventLogs("evt-1", { limit: 50 })
    expect(nextCursor).toBeNull()
  })

  it("resolves a shiftId reference in changes to a label with role, date and time — not just the role name, which is ambiguous when several shifts share it", async () => {
    findMany.mockResolvedValue([
      row({ changes: { shiftId: { from: null, to: "shift-bar-1" } } }),
    ])
    shiftFindMany.mockResolvedValue([
      { id: "shift-bar-1", roleName: "Bar", label: "Bar", date: new Date("2026-06-14T00:00:00.000Z"), startTime: "18:00", endTime: "20:00" },
    ])
    const { shiftLabels } = await listEventLogs("evt-1", {})
    expect(shiftLabels["shift-bar-1"]).toEqual({
      compact: "Bar · 14/06 18:00–20:00",
      prose: "Bar du 14/06, 18:00–20:00",
    })
  })

  it("does not query shifts at all when nothing in changes references one", async () => {
    findMany.mockResolvedValue([row()]) // changes: { capacity: {...} }, no shiftId
    await listEventLogs("evt-1", {})
    expect(shiftFindMany).not.toHaveBeenCalled()
  })
})

describe("getCausalChain", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminFindMany.mockResolvedValue([])
    volunteerFindMany.mockResolvedValue([{ id: "vol-1", firstName: "Alain", lastName: "Dupont" }])
    shiftFindMany.mockResolvedValue([])
  })

  it("follows causedByLogId transitively and returns the chain oldest first", async () => {
    const cancelled = row({ id: "log-1", action: "registration.cancelled", createdAt: new Date("2026-09-22T10:00:00.000Z") })
    const offered = row({
      id: "log-2",
      action: "registration.waitlist_offered",
      actorType: "system",
      actorId: null,
      causedByLogId: "log-1",
      createdAt: new Date("2026-09-22T10:00:01.000Z"),
    })
    const confirmed = row({
      id: "log-3",
      action: "registration.waitlist_confirmed",
      actorType: "volunteer",
      actorId: "vol-1",
      causedByLogId: "log-2",
      createdAt: new Date("2026-09-22T11:00:00.000Z"),
    })

    // First call: fetch the root. Second: nothing more caused by log-1 except log-2's discovery pass.
    findMany
      .mockResolvedValueOnce([cancelled]) // fetch frontier=[log-1]
      .mockResolvedValueOnce([{ id: "log-2" }]) // caused by log-1
      .mockResolvedValueOnce([offered]) // fetch frontier=[log-2]
      .mockResolvedValueOnce([{ id: "log-3" }]) // caused by log-2
      .mockResolvedValueOnce([confirmed]) // fetch frontier=[log-3]
      .mockResolvedValueOnce([]) // nothing caused by log-3

    const { entries: chain } = await getCausalChain("log-1")
    expect(chain.map((e) => e.id)).toEqual(["log-1", "log-2", "log-3"])
    expect(chain[2].actorLabel).toBe("Alain Dupont")
  })

  it("returns just the root when nothing was caused by it", async () => {
    findMany.mockResolvedValueOnce([row()]).mockResolvedValueOnce([])
    const { entries: chain } = await getCausalChain("log-1")
    expect(chain).toHaveLength(1)
  })
})

describe("listReplayCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shiftFindMany.mockResolvedValue([])
    findMany.mockResolvedValue([])
  })

  it("returns nothing when no entity has more than one entry", async () => {
    groupBy.mockResolvedValue([])
    const candidates = await listReplayCandidates("evt-1")
    expect(candidates).toEqual([])
  })

  it("labels a Shift candidate with its role, date and time, not a raw id", async () => {
    groupBy.mockResolvedValue([{ entityType: "Shift", entityId: "shift-1", _count: { id: 3 } }])
    shiftFindMany.mockResolvedValue([
      { id: "shift-1", roleName: "Bar", label: "Bar", date: new Date("2026-06-25T00:00:00.000Z"), startTime: "18:15", endTime: "19:00" },
    ])
    const [candidate] = await listReplayCandidates("evt-1")
    expect(candidate).toMatchObject({ entityType: "Shift", entityId: "shift-1", count: 3, label: "Bar · 25/06 18:15–19:00" })
  })

  it("labels a Registration candidate by the shift it's for, taken from its own logged changes", async () => {
    groupBy.mockResolvedValue([{ entityType: "Registration", entityId: "reg-1", _count: { id: 2 } }])
    findMany.mockResolvedValue([{ entityId: "reg-1", changes: { shiftId: { from: null, to: "shift-1" } } }])
    shiftFindMany.mockResolvedValue([
      { id: "shift-1", roleName: "Bar", label: "Bar", date: new Date("2026-06-25T00:00:00.000Z"), startTime: "18:15", endTime: "19:00" },
    ])
    const [candidate] = await listReplayCandidates("evt-1")
    expect(candidate.label).toBe("Inscription — Bar · 25/06 18:15–19:00")
  })

  it("falls back to a truncated id when no shift can be resolved", async () => {
    groupBy.mockResolvedValue([{ entityType: "Registration", entityId: "reg-without-shift-info", _count: { id: 2 } }])
    findMany.mockResolvedValue([])
    const [candidate] = await listReplayCandidates("evt-1")
    expect(candidate.label).toMatch(/^Inscription \(/)
  })
})

describe("listStoryCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminFindMany.mockResolvedValue([])
    volunteerFindMany.mockResolvedValue([{ id: "vol-1", firstName: "Alain", lastName: "Dupont" }])
  })

  it("excludes a root entry that caused nothing — a single entry isn't a story", async () => {
    findMany
      .mockResolvedValueOnce([{ id: "log-1", action: "registration.created", actorType: "volunteer", actorId: "vol-1", createdAt: new Date() }])
      .mockResolvedValueOnce([]) // nothing caused by log-1
    const candidates = await listStoryCandidates("evt-1")
    expect(candidates).toEqual([])
  })

  it("includes a root that caused at least one other entry, with a readable step count", async () => {
    findMany
      .mockResolvedValueOnce([
        { id: "log-1", action: "registration.cancelled", actorType: "volunteer", actorId: "vol-1", createdAt: new Date("2026-09-13T09:00:00.000Z") },
      ])
      .mockResolvedValueOnce([{ causedByLogId: "log-1" }, { causedByLogId: "log-1" }]) // 2 entries caused by log-1
    const candidates = await listStoryCandidates("evt-1")
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ logId: "log-1", entryCount: 3 }) // root + 2 caused
    expect(candidates[0].label).toContain("Alain Dupont")
  })
})
