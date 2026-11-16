import { describe, it, expect, vi, beforeEach } from "vitest"

// Capture the extension config so the tests can drive the callback directly without Prisma.
const lastExtendConfig: { current: unknown } = { current: null }

const m = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventCount: vi.fn(),
  shiftFindUnique: vi.fn(),
  volunteerFindUnique: vi.fn(),
  logoFindUnique: vi.fn(),
  grantFindUnique: vi.fn(),
  adminCount: vi.fn(),
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
    adminEventAccess: { findUnique: m.grantFindUnique },
    adminUser: { count: m.adminCount },
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

  // Front-desk grants (#1142): organisation-owned like any direct model, and pointing to an event
  // and an admin account that must be the organisation's too.
  describe("front-desk grant (adminEventAccess), a direct model", () => {
    it("reads only this organisation's grants", async () => {
      const { promise, query } = run("org-A", "AdminEventAccess", "findFirst", { where: { adminUserId: "adm-1", eventId: "e1" } })
      await promise
      expect(query).toHaveBeenCalledWith({ where: { AND: [{ adminUserId: "adm-1", eventId: "e1" }, { organizationId: "org-A" }] } })
      const many = run("org-A", "AdminEventAccess", "updateMany", { where: { eventId: "e1" }, data: { revokedAt: new Date(0) } })
      await many.promise
      expect(many.query).toHaveBeenCalledWith({ where: { AND: [{ eventId: "e1" }, { organizationId: "org-A" }] }, data: { revokedAt: new Date(0) } })
    })

    it("another organisation's grant behaves like a missing one: null on read, refused on update and delete", async () => {
      m.grantFindUnique.mockResolvedValue({ organizationId: "org-B" })
      const read = run("org-A", "AdminEventAccess", "findUnique", { where: { id: "g1" } })
      expect(await read.promise).toBeNull()
      expect(read.query).not.toHaveBeenCalled()
      for (const op of ["update", "delete"]) {
        const write = run("org-A", "AdminEventAccess", op, { where: { id: "g1" }, data: { revokedAt: null } })
        await expect(write.promise).rejects.toBeInstanceOf(TenantAccessError)
        expect(write.query).not.toHaveBeenCalled()
      }
    })

    it("creates a grant for this organisation's event and account, forcing organizationId", async () => {
      m.eventCount.mockResolvedValue(1)
      m.adminCount.mockResolvedValue(1)
      const { promise, query } = run("org-A", "AdminEventAccess", "create", { data: { adminUserId: "adm-1", eventId: "e1", organizationId: "ATTACKER" } }, {})
      await promise
      expect(m.eventCount).toHaveBeenCalledWith({ where: { id: { in: ["e1"] }, organizationId: "org-A" } })
      expect(m.adminCount).toHaveBeenCalledWith({ where: { id: { in: ["adm-1"] }, organizationId: "org-A" } })
      expect(query).toHaveBeenCalledWith({ data: { adminUserId: "adm-1", eventId: "e1", organizationId: "org-A" } })
    })

    it("refuses a grant on another organisation's event", async () => {
      m.eventCount.mockResolvedValue(0)
      m.adminCount.mockResolvedValue(1)
      const { promise, query } = run("org-A", "AdminEventAccess", "create", { data: { adminUserId: "adm-1", eventId: "e-of-B" } })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(query).not.toHaveBeenCalled()
    })

    it("refuses a grant for another organisation's account, or without an account or an event", async () => {
      m.eventCount.mockResolvedValue(1)
      m.adminCount.mockResolvedValue(0)
      const foreign = run("org-A", "AdminEventAccess", "create", { data: { adminUserId: "adm-of-B", eventId: "e1" } })
      await expect(foreign.promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(foreign.query).not.toHaveBeenCalled()
      m.adminCount.mockResolvedValue(1)
      for (const data of [{ eventId: "e1" }, { adminUserId: "adm-1" }]) {
        const missing = run("org-A", "AdminEventAccess", "create", { data })
        await expect(missing.promise).rejects.toBeInstanceOf(TenantAccessError)
        expect(missing.query).not.toHaveBeenCalled()
      }
    })

    it("checks every row of a createMany, and the row an upsert would create", async () => {
      m.eventCount.mockResolvedValue(2)
      m.adminCount.mockResolvedValue(1) // two distinct accounts asked, one is the organisation's
      const many = run("org-A", "AdminEventAccess", "createMany", { data: [{ adminUserId: "adm-1", eventId: "e1" }, { adminUserId: "adm-of-B", eventId: "e2" }] })
      await expect(many.promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(many.query).not.toHaveBeenCalled()

      m.grantFindUnique.mockResolvedValue(null)
      m.eventCount.mockResolvedValue(0)
      const upsert = run("org-A", "AdminEventAccess", "upsert", { where: { adminUserId_eventId: { adminUserId: "adm-1", eventId: "e-of-B" } }, create: { adminUserId: "adm-1", eventId: "e-of-B" }, update: {} })
      await expect(upsert.promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(upsert.query).not.toHaveBeenCalled()
    })
  })

  // A grant is immutable in its organisation, event and account: only revokedAt and expiresAt change.
  describe("front-desk grant: no update may name its organisation, event or account", () => {
    const FORBIDDEN: [string, Record<string, unknown>][] = [
      ["organizationId", { organizationId: "org-B" }],
      ["eventId", { eventId: "e-of-B" }],
      ["adminUserId", { adminUserId: "adm-of-B" }],
      ["organization: { connect }", { organization: { connect: { id: "org-B" } } }],
      ["event: { connect }", { event: { connect: { id: "e-of-B" } } }],
      ["adminUser: { connect }", { adminUser: { connect: { id: "adm-of-B" } } }],
      ["event: { update } (any nested write)", { event: { update: { title: "x" } } }],
      ["its current organisation again", { organizationId: "org-A" }],
    ]

    it.each(FORBIDDEN)("update refuses %s, before reading or writing anything", async (_label, data) => {
      m.grantFindUnique.mockResolvedValue({ organizationId: "org-A" })
      const { promise, query } = run("org-A", "AdminEventAccess", "update", { where: { id: "g1" }, data: { revokedAt: new Date(0), ...data } })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(query).not.toHaveBeenCalled()
      expect(m.grantFindUnique).not.toHaveBeenCalled()
    })

    it.each(FORBIDDEN)("updateMany refuses %s", async (_label, data) => {
      for (const op of ["updateMany", "updateManyAndReturn"]) {
        const { promise, query } = run("org-A", "AdminEventAccess", op, { where: { eventId: "e1" }, data })
        await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
        expect(query).not.toHaveBeenCalled()
      }
    })

    it.each(FORBIDDEN)("upsert on an existing grant refuses %s in its update branch", async (_label, data) => {
      m.grantFindUnique.mockResolvedValue({ organizationId: "org-A" })
      m.eventCount.mockResolvedValue(1)
      m.adminCount.mockResolvedValue(1)
      const { promise, query } = run("org-A", "AdminEventAccess", "upsert", { where: { adminUserId_eventId: { adminUserId: "adm-1", eventId: "e1" } }, create: { adminUserId: "adm-1", eventId: "e1" }, update: data })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(query).not.toHaveBeenCalled()
    })

    it("the same update branch is refused when the row does not exist yet", async () => {
      m.grantFindUnique.mockResolvedValue(null)
      m.eventCount.mockResolvedValue(1)
      m.adminCount.mockResolvedValue(1)
      const { promise, query } = run("org-A", "AdminEventAccess", "upsert", { where: { id: "g1" }, create: { adminUserId: "adm-1", eventId: "e1" }, update: { eventId: "e-of-B" } })
      await expect(promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(query).not.toHaveBeenCalled()
    })

    it("revoking, restoring and changing the expiry go through, on this organisation's grant only", async () => {
      m.grantFindUnique.mockResolvedValue({ organizationId: "org-A" })
      const expiresAt = new Date("2027-06-13T00:00:00Z")
      const update = run("org-A", "AdminEventAccess", "update", { where: { id: "g1" }, data: { revokedAt: new Date(0), expiresAt } }, {})
      await update.promise
      expect(update.query).toHaveBeenCalledWith({ where: { id: "g1" }, data: { revokedAt: new Date(0), expiresAt } })

      const many = run("org-A", "AdminEventAccess", "updateMany", { where: { eventId: "e1" }, data: { revokedAt: null } })
      await many.promise
      expect(many.query).toHaveBeenCalledWith({ where: { AND: [{ eventId: "e1" }, { organizationId: "org-A" }] }, data: { revokedAt: null } })

      const upsert = run("org-A", "AdminEventAccess", "upsert", { where: { id: "g1" }, create: { adminUserId: "adm-1", eventId: "e1" }, update: { revokedAt: null, expiresAt } }, {})
      await upsert.promise
      expect(upsert.query).toHaveBeenCalled()

      // Another organisation's grant stays out of reach, even for an allowed field.
      m.grantFindUnique.mockResolvedValue({ organizationId: "org-B" })
      const foreign = run("org-A", "AdminEventAccess", "update", { where: { id: "g2" }, data: { revokedAt: null } })
      await expect(foreign.promise).rejects.toBeInstanceOf(TenantAccessError)
      expect(foreign.query).not.toHaveBeenCalled()
    })

    it("other models are not concerned: an event's own update still goes through", async () => {
      m.eventFindUnique.mockResolvedValue({ organizationId: "org-A" })
      const { promise, query } = run("org-A", "Event", "update", { where: { id: "e1" }, data: { organizationId: "org-A", title: "F" } }, {})
      await promise
      expect(query).toHaveBeenCalled()
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
