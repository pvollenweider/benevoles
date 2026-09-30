import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression (Sentry, 2026-09-30): changing a member's email to one another member of the
// organisation already has hit Volunteer_organizationId_email_key and answered a 500.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const orgLogCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { orgLog: { create: orgLogCreate } } }))

const alice = { id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true }

function setup(findFirst: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>) {
  requireOrgSessionMock.mockResolvedValue({
    db: { volunteer: { findFirst, update } },
    organizationId: "org-a",
    session: { user: { id: "admin-1" } },
  })
}

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/members/[id]/route")
  return PATCH(
    new Request("http://localhost/api/admin/members/mem-1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "mem-1" }) },
  )
}

describe("PATCH /api/admin/members/[id] — email already used", () => {
  beforeEach(() => vi.clearAllMocks())

  it("answers 409 with a message when another member has the address, without writing", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce({ id: "mem-2" })
    const update = vi.fn()
    setup(findFirst, update)
    const res = await patch({ email: "B@X.com " })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/déjà cette adresse email/)
    expect(findFirst).toHaveBeenLastCalledWith({ where: { email: "b@x.com", NOT: { id: "mem-1" } } })
    expect(update).not.toHaveBeenCalled()
  })

  it("answers 409 when a concurrent write takes the address (unique violation)", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce(null)
    const update = vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }))
    setup(findFirst, update)
    const res = await patch({ email: "b@x.com" })
    expect(res.status).toBe(409)
  })

  it("does not check other members when the email is unchanged", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(alice)
    const update = vi.fn().mockResolvedValue({ ...alice, firstName: "Alicia" })
    setup(findFirst, update)
    orgLogCreate.mockResolvedValue({ id: "log-1" })
    const res = await patch({ firstName: "Alicia", email: "a@x.com" })
    expect(res.status).toBe(200)
    expect(findFirst).toHaveBeenCalledTimes(1)
  })

  it("still rethrows other database errors", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(alice)
    const update = vi.fn().mockRejectedValue(new Error("connection lost"))
    setup(findFirst, update)
    await expect(patch({ firstName: "Alicia" })).rejects.toThrow("connection lost")
  })
})
