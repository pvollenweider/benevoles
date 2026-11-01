import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression (Sentry, 2026-09-30): changing a member's email to one another member of the
// organisation already has hit Volunteer_organizationId_email_key and answered a 500.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))

const orgLogCreate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { orgLog: { create: orgLogCreate } } }))

// An address change renews the member's links (src/lib/member-address-revocation.ts, covered by
// src/__integration__/member-address-revocation.int.test.ts): stubbed here.
const renewMemberLinks = vi.hoisted(() => vi.fn())
vi.mock("@/lib/member-address-revocation", () => ({ renewMemberLinks }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse: vi.fn() }))

const alice = { id: "mem-1", firstName: "Alice", lastName: "L", email: "a@x.com", phone: null, tags: [], notes: null, active: true }

function setup(findFirst: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>) {
  // An address change runs in a transaction with the row locked and read again there.
  const tx = { $queryRaw: vi.fn(), volunteer: { findFirst: vi.fn().mockResolvedValue({ email: alice.email, erasedAt: null }), update } }
  requireOrgSessionMock.mockResolvedValue({
    db: { volunteer: { findFirst, update }, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
    organizationId: "org-a",
    session: { user: { id: "admin-1" } },
  })
  renewMemberLinks.mockResolvedValue({ registrations: 0, invites: 0, pushSubscriptions: 0, cancelled: 0, outboxIds: [] })
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

describe("PATCH /api/admin/members/[id] — a corrected address renews the member's links", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renews the links in the transaction, with the address read under the lock, and says so", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(alice).mockResolvedValueOnce(null)
    const update = vi.fn().mockResolvedValue({ ...alice, email: "right@x.com" })
    setup(findFirst, update)
    renewMemberLinks.mockResolvedValue({ registrations: 2, invites: 1, pushSubscriptions: 0, cancelled: 1, outboxIds: ["o1", "o2"] })
    orgLogCreate.mockResolvedValue({ id: "log-1" })
    const res = await patch({ email: "right@x.com" })
    expect(res.status).toBe(200)
    expect((await res.json()).linksRenewed).toEqual({ links: 3, emailsQueued: 2 })
    expect(renewMemberLinks).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: "org-a", oldEmail: "a@x.com", newEmail: "right@x.com" }))
  })

  it("renews nothing when only the case of the address changes", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(alice)
    const update = vi.fn().mockResolvedValue(alice)
    setup(findFirst, update)
    const res = await patch({ email: "A@X.com" })
    expect(res.status).toBe(200)
    expect(renewMemberLinks).not.toHaveBeenCalled()
    expect((await res.json()).linksRenewed).toBeUndefined()
  })

  it("refuses any edit of a merge tombstone (#600), like an erased record, without writing", async () => {
    const findFirst = vi.fn().mockResolvedValue({ ...alice, email: null, erasedAt: null, mergedIntoId: "mem-kept" })
    const update = vi.fn()
    setup(findFirst, update)
    const res = await patch({ firstName: "Alice", phone: "079 555 12 34" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/fusionnée/)
    expect(update).not.toHaveBeenCalled()
  })
})

