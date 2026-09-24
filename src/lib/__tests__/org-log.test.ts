import { describe, it, expect, vi, beforeEach } from "vitest"

const create = vi.hoisted(() => vi.fn())
vi.mock("../prisma", () => ({ prisma: { orgLog: { create } } }))

import { logOrgEvent, adminActor, SYSTEM_ACTOR, diffFields } from "../org-log"

describe("logOrgEvent", () => {
  beforeEach(() => vi.clearAllMocks())

  it("writes an entry and returns its id", async () => {
    create.mockResolvedValue({ id: "log-1" })
    const id = await logOrgEvent({
      organizationId: "org-a",
      actor: adminActor({ user: { id: "admin-1" } }),
      action: "member.created",
      entityType: "Member",
      entityId: "mem-1",
    })
    expect(id).toBe("log-1")
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-a",
          actorType: "admin",
          actorId: "admin-1",
          action: "member.created",
          entityType: "Member",
          entityId: "mem-1",
        }),
      }),
    )
  })

  it("never throws — swallows a write failure and returns null", async () => {
    create.mockRejectedValue(new Error("db down"))
    const id = await logOrgEvent({
      organizationId: "org-a",
      actor: SYSTEM_ACTOR,
      action: "member.updated",
      entityType: "Member",
      entityId: "mem-1",
    })
    expect(id).toBeNull()
  })

  it("re-exports diffFields from event-log.ts (shared primitive, not duplicated)", () => {
    expect(diffFields({ a: 1 }, { a: 2 }, ["a"])).toEqual({ a: { from: 1, to: 2 } })
  })
})
