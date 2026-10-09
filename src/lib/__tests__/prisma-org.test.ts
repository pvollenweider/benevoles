import { describe, it, expect, vi, beforeEach } from "vitest"

// Capture the extension config so the tests can drive the callback directly without Prisma.
const lastExtendConfig: { current: unknown } = { current: null }

const m = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventCount: vi.fn(),
  shiftFindUnique: vi.fn(),
  volunteerFindUnique: vi.fn(),
  logoFindUnique: vi.fn(),
}))

vi.mock("../prisma", () => ({
  prisma: {
    $extends(config: unknown) {
      lastExtendConfig.current = config
      return { __scoped: true, config }
    },
    event: { findUnique: m.eventFindUnique, count: m.eventCount },
    shift: { findUnique: m.shiftFindUnique },
    volunteer: { findUnique: m.volunteerFindUnique },
    organizationLogo: { findUnique: m.logoFindUnique },
  },
}))

const touch = vi.hoisted(() => vi.fn())
vi.mock("../org-activity", () => ({ touchOrgActivity: touch }))

import { getOrgClient, TenantAccessError } from "../prisma-org"

type Args = Record<string, unknown>
type Hook = (input: { model: string; operation: string; args: Args; query: (a: unknown) => unknown }) => Promise<unknown>

function run(orgId: string, model: string, operation: string, args: Args, result: unknown = []) {
  getOrgClient(orgId)
  const cfg = lastExtendConfig.current as { name: string; query: { $allModels: { $allOperations: Hook } } }
  const query = vi.fn().mockResolvedValue(result)
  return { promise: cfg.query.$allModels.$allOperations({ model, operation, args, query }), query, cfg }
}

describe("getOrgClient", () => {
  beforeEach(() => {
    lastExtendConfig.current = null
    for (const fn of Object.values(m)) fn.mockReset()
  })

  it("registers one extension named 'org-scoped' covering every model and operation", () => {
    const { cfg } = run("org-A", "Event", "findMany", {})
    expect(cfg.name).toBe("org-scoped")
    expect(cfg.query.$allModels.$allOperations).toBeTypeOf("function")
  })

  describe("multi-row operations get the org filter AND-ed in", () => {
    it("direct model (event.findMany)", async () => {
      const args: Args = { where: { publicStatus: "published" } }
      const { promise, query } = run("org-A", "Event", "findMany", args)
      await promise
      expect(query).toHaveBeenCalledWith({ where: { AND: [{ publicStatus: "published" }, { organizationId: "org-A" }] } })
    })

    it("no where at all (event.count)", async () => {
      const args: Args = {}
      const { promise, query } = run("org-A", "Event", "count", args, 0)
      await promise
      expect(query).toHaveBeenCalledWith({ where: { organizationId: "org-A" } })
    })

    it("event-owned model via the parent event (shift.findFirst)", async () => {
      const { promise, query } = run("org-A", "Shift", "findFirst", { where: { id: "s1" } }, null)
      await promise
      expect(query).toHaveBeenCalledWith({ where: { AND: [{ id: "s1" }, { event: { organizationId: "org-A" } }] } })
    })

    it("a caller-provided event filter can't widen the scope (AND, not merge)", async () => {
      const { promise, query } = run("org-A", "MemberInvite", "findFirst", { where: { event: { organizationId: "org-B" } } }, null)
      await promise
      expect(query).toHaveBeenCalledWith({
        where: { AND: [{ event: { organizationId: "org-B" } }, { event: { organizationId: "org-A" } }] },
      })
    })

    it("models newly covered (#268): eventPage, sectorLeader, eventMilestone, eventLog, orgLog, orgSlugHistory", async () => {
      for (const model of ["EventPage", "SectorLeader", "EventMilestone", "EventLog"]) {
        const { promise, query } = run("org-A", model, "findMany", {})
        await promise
        expect(query).toHaveBeenCalledWith({ where: { event: { organizationId: "org-A" } } })
      }
      for (const model of ["OrgLog", "OrgSlugHistory"]) {
        const { promise, query } = run("org-A", model, "findMany", {})
        await promise
        expect(query).toHaveBeenCalledWith({ where: { organizationId: "org-A" } })
      }
    })

    it("updateMany/deleteMany are scoped too", async () => {
      const { promise, query } = run("org-A", "Shift", "updateMany", { where: { eventId: "e1" }, data: { displayOrder: 1 } }, { count: 0 })
      await promise
      expect(query).toHaveBeenCalledWith({ where: { AND: [{ eventId: "e1" }, { event: { organizationId: "org-A" } }] }, data: { displayOrder: 1 } })
    })
  })

  describe("unique-key operations check the row's owner first", () => {
    it("runs update when the row belongs to the org", async () => {
      m.shiftFindUnique.mockResolvedValue({ event: { organizationId: "org-A" } })
      const { promise, query } = run("org-A", "Shift", "update", { where: { id: "s1" }, data: { label: "x" } }, {})
      await promise
      expect(query).toHaveBeenCalled()
    })

    it("refuses update/delete on another org's row, as if it didn't exist", async () => {
      m.shiftFindUnique.mockResolvedValue({ event: { organizationId: "org-B" } })
      const upd = run("org-A", "Shift", "update", { where: { id: "s1" }, data: {} })
      await expect(upd.promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(upd.query).not.toHaveBeenCalled()

      m.volunteerFindUnique.mockResolvedValue({ organizationId: "org-B" })
      const del = run("org-A", "Volunteer", "delete", { where: { id: "v1" } })
      await expect(del.promise).rejects.toMatchObject({ code: "P2025" })
      expect(del.query).not.toHaveBeenCalled()
    })

    it("findUnique on another org's row returns null", async () => {
      m.eventFindUnique.mockResolvedValue({ organizationId: "org-B" })
      const { promise, query } = run("org-A", "Event", "findUnique", { where: { id: "e1" } })
      expect(await promise).toBeNull()
      expect(query).not.toHaveBeenCalled()
    })

    it("refuses update on a row that doesn't exist (no silent pass-through)", async () => {
      m.shiftFindUnique.mockResolvedValue(null)
      const { promise } = run("org-A", "Shift", "update", { where: { id: "nope" }, data: {} })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
    })
  })

  describe("creates", () => {
    it("forces organizationId on direct models (overrides a caller-provided value)", async () => {
      const { promise, query } = run("org-A", "Event", "create", { data: { title: "F", organizationId: "ATTACKER" } }, {})
      await promise
      expect(query).toHaveBeenCalledWith({ data: { title: "F", organizationId: "org-A" } })
    })

    it("allows an event-owned create pointing to an event of the org", async () => {
      m.eventCount.mockResolvedValue(1)
      const { promise, query } = run("org-A", "EventPage", "create", { data: { eventId: "e1", title: "FAQ" } }, {})
      await promise
      expect(m.eventCount).toHaveBeenCalledWith({ where: { id: { in: ["e1"] }, organizationId: "org-A" } })
      expect(query).toHaveBeenCalled()
    })

    it("refuses an event-owned create pointing to another org's event", async () => {
      m.eventCount.mockResolvedValue(0)
      const { promise, query } = run("org-A", "Shift", "create", { data: { eventId: "e-of-B" } })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(query).not.toHaveBeenCalled()
    })

    it("checks every row of a createMany", async () => {
      m.eventCount.mockResolvedValue(1) // only one of the two distinct events is in the org
      const { promise } = run("org-A", "MemberInvite", "createMany", { data: [{ eventId: "e1" }, { eventId: "e2" }] })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
    })
  })

  describe("organization logo (#300), a direct model", () => {
    it("upsert of a missing logo creates it for the org, whatever the caller sent", async () => {
      m.logoFindUnique.mockResolvedValue(null)
      const { promise, query } = run("org-A", "OrganizationLogo", "upsert", { where: { organizationId: "org-A" }, create: { organizationId: "ATTACKER", hash: "h" }, update: { hash: "h" } }, {})
      await promise
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ create: { organizationId: "org-A", hash: "h" } }))
    })

    it("refuses to replace another org's logo", async () => {
      m.logoFindUnique.mockResolvedValue({ organizationId: "org-B" })
      const { promise, query } = run("org-A", "OrganizationLogo", "upsert", { where: { organizationId: "org-B" }, create: { hash: "h" }, update: { hash: "h" } })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(query).not.toHaveBeenCalled()
    })

    it("deleteMany only reaches the org's logo", async () => {
      const { promise, query } = run("org-A", "OrganizationLogo", "deleteMany", { where: { organizationId: "org-B" } }, { count: 0 })
      await promise
      expect(query).toHaveBeenCalledWith({ where: { AND: [{ organizationId: "org-B" }, { organizationId: "org-A" }] } })
    })
  })

  it("leaves non-tenant models alone (e.g. Organization, AdminUser)", async () => {
    const args: Args = { where: { id: "o1" } }
    const { promise, query } = run("org-A", "Organization", "findUnique", args, {})
    await promise
    expect(query).toHaveBeenCalledWith({ where: { id: "o1" } })
  })

  it("two clients with different orgs scope to their own org id", async () => {
    const a = run("org-A", "Event", "findMany", {})
    await a.promise
    expect(a.query).toHaveBeenCalledWith({ where: { organizationId: "org-A" } })
    const b = run("org-B", "Event", "findMany", {})
    await b.promise
    expect(b.query).toHaveBeenCalledWith({ where: { organizationId: "org-B" } })
  })
})

// #811: the organisation's own writes are its meaningful activity; reads and logs are not.
describe("getOrgClient and the organisation's activity", () => {
  beforeEach(() => { touch.mockReset() })

  it("records activity after a successful write on a meaningful model", async () => {
    m.eventCount.mockResolvedValue(1)
    await run("org-a", "Shift", "create", { data: { eventId: "evt-a", roleName: "Bar" } }).promise
    expect(touch).toHaveBeenCalledWith("org-a")
    touch.mockReset()
    await run("org-a", "Organization", "update", { where: { id: "org-a" }, data: { name: "X" } }).promise
    expect(touch).toHaveBeenCalledWith("org-a")
  })

  it("records nothing for a read or a log line, nor when the write fails", async () => {
    await run("org-a", "Event", "findMany", {}).promise
    await run("org-a", "OrgLog", "create", { data: { action: "x" } }).promise
    expect(touch).not.toHaveBeenCalled()
    m.eventCount.mockResolvedValue(0)
    await expect(run("org-a", "Shift", "create", { data: { eventId: "evt-b" } }).promise).rejects.toBeInstanceOf(TenantAccessError)
    expect(touch).not.toHaveBeenCalled()
  })
})
