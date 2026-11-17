import { describe, it, expect, vi } from "vitest"
import { deleteAbandonedSignupSpaces, deleteExpiredDeactivatedOrgs } from "../org-cleanup"

const cutoff = new Date("2026-01-01T00:00:00Z")

// A transaction client whose organisations are read twice: the cleanup's list, then what is left.
function makeTx(over: { due: string[]; deleted: number; left?: string[]; admins?: { id: string; organizationId: string }[] }) {
  const tx = {
    organization: {
      findMany: vi.fn()
        .mockResolvedValueOnce(over.due.map((id) => ({ id })))
        .mockResolvedValue((over.left ?? []).map((id) => ({ id }))),
      deleteMany: vi.fn().mockResolvedValue({ count: over.deleted }),
    },
    adminUser: {
      findMany: vi.fn().mockResolvedValue(over.admins ?? []),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length })),
    },
  }
  return tx
}

describe("deleteExpiredDeactivatedOrgs", () => {
  it("re-applies the retention condition in the delete itself", async () => {
    const tx = makeTx({ due: ["o1"], deleted: 1, admins: [{ id: "a1", organizationId: "o1" }] })
    const out = await deleteExpiredDeactivatedOrgs(tx as never, cutoff)
    const where = tx.organization.deleteMany.mock.calls[0][0].where
    expect(JSON.stringify(where)).toContain("\"active\":false")
    expect(JSON.stringify(where)).toContain("\"o1\"")
    expect(out).toEqual({ deletedOrgs: { count: 1 }, deletedOrgAdmins: { count: 1 } })
    expect(tx.organization.findMany).toHaveBeenCalledTimes(1)
  })

  it("deletes the administrators of the organisations actually removed only", async () => {
    // o2 was reactivated between the read and the delete: it is still there.
    const tx = makeTx({
      due: ["o1", "o2"], deleted: 1, left: ["o2"],
      admins: [{ id: "a1", organizationId: "o1" }, { id: "a2", organizationId: "o2" }],
    })
    const out = await deleteExpiredDeactivatedOrgs(tx as never, cutoff)
    expect(tx.adminUser.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a1"] } } })
    expect(out).toEqual({ deletedOrgs: { count: 1 }, deletedOrgAdmins: { count: 1 } })
  })

  it("deletes no administrator when every organisation was reactivated meanwhile", async () => {
    const tx = makeTx({ due: ["o1"], deleted: 0, left: ["o1"], admins: [{ id: "a1", organizationId: "o1" }] })
    const out = await deleteExpiredDeactivatedOrgs(tx as never, cutoff)
    expect(tx.adminUser.deleteMany).not.toHaveBeenCalled()
    expect(out).toEqual({ deletedOrgs: { count: 0 }, deletedOrgAdmins: { count: 0 } })
  })

  it("touches nothing when no organisation is due", async () => {
    const tx = makeTx({ due: [], deleted: 0 })
    await deleteExpiredDeactivatedOrgs(tx as never, cutoff)
    expect(tx.organization.deleteMany).not.toHaveBeenCalled()
    expect(tx.adminUser.deleteMany).not.toHaveBeenCalled()
  })
})

describe("deleteAbandonedSignupSpaces", () => {
  it("re-checks that no administrator is active, and spares a space activated meanwhile with its accounts", async () => {
    const tx = makeTx({ due: ["o1", "o2"], deleted: 1, left: ["o2"], admins: [{ id: "a1", organizationId: "o1" }, { id: "a2", organizationId: "o2" }] })
    const out = await deleteAbandonedSignupSpaces(tx as never, cutoff)
    expect(JSON.stringify(tx.organization.deleteMany.mock.calls[0][0].where)).toContain("\"admins\":{\"none\"")
    expect(tx.adminUser.findMany.mock.calls[0][0].where).toMatchObject({ isActive: false })
    expect(tx.adminUser.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a1"] } } })
    expect(out.deletedOrgs.count).toBe(1)
  })
})
