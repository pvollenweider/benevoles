import { describe, it, expect, vi, beforeEach } from "vitest"

const findMany = vi.hoisted(() => vi.fn())
const adminFindMany = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({
  prisma: { orgLog: { findMany }, adminUser: { findMany: adminFindMany } },
}))

import { listOrgLogs, entityTypeLabel } from "../org-log-read"

describe("listOrgLogs", () => {
  beforeEach(() => vi.clearAllMocks())

  it("scopes the query to the given organization", async () => {
    findMany.mockResolvedValue([])
    await listOrgLogs("org-a", {})
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-a" } }),
    )
  })

  it("applies entityType and action-prefix filters", async () => {
    findMany.mockResolvedValue([])
    await listOrgLogs("org-a", { entityType: "Member", action: "member" })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-a", entityType: "Member", action: { startsWith: "member" } },
      }),
    )
  })

  it("resolves the actor's display name from AdminUser", async () => {
    findMany.mockResolvedValue([
      { id: "log-1", actorType: "admin", actorId: "admin-1", action: "member.created", entityType: "Member", entityId: "mem-1", changes: null, createdAt: new Date() },
    ])
    adminFindMany.mockResolvedValue([{ id: "admin-1", name: "Alice" }])
    const { entries } = await listOrgLogs("org-a")
    expect(entries[0].actorLabel).toBe("Alice")
  })

  it("falls back to a generic label when the admin record is gone", async () => {
    findMany.mockResolvedValue([
      { id: "log-1", actorType: "admin", actorId: "admin-deleted", action: "member.created", entityType: "Member", entityId: "mem-1", changes: null, createdAt: new Date() },
    ])
    adminFindMany.mockResolvedValue([])
    const { entries } = await listOrgLogs("org-a")
    expect(entries[0].actorLabel).toBe("Admin (compte supprimé)")
  })

  it("paginates via nextCursor when there are more rows than the limit", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `log-${i}`, actorType: "system", actorId: null, action: "member.created",
      entityType: "Member", entityId: "mem-1", changes: null, createdAt: new Date(),
    }))
    findMany.mockResolvedValue(rows)
    const { entries, nextCursor } = await listOrgLogs("org-a", { limit: 2 })
    expect(entries).toHaveLength(2)
    expect(nextCursor).toBe("log-1")
  })
})

describe("entityTypeLabel", () => {
  it("labels known entity types in French", () => {
    expect(entityTypeLabel("Member")).toBe("Membre")
    expect(entityTypeLabel("AdminUser")).toBe("Compte admin")
  })

  it("falls back to the raw entityType for anything unmapped", () => {
    expect(entityTypeLabel("Widget")).toBe("Widget")
  })
})
