import { describe, it, expect, vi, beforeEach } from "vitest"
import { hashToken } from "@/lib/token-hash"

// « Renouveler mon lien » (#1429): the old token is replaced in the same transaction that queues
// the new link by email. The answer never contains the token. The rotation is conditioned on the
// hash of the presented token, and the address is read after the update inside the transaction.

const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  lookupOrgLink: vi.fn(),
  rotate: vi.fn(),
  enqueue: vi.fn(),
  deliver: vi.fn(),
  rateLimit: vi.fn(),
  tokenLookupsBlocked: vi.fn(),
  recordTokenMiss: vi.fn(),
  tokenUseAllowed: vi.fn(),
  regFindMany: vi.fn(),
  regUpdate: vi.fn(),
  // The single row the transaction reads after the rotation.
  current: { firstName: "Léa", lastName: "M", email: "lea@example.ch" as string | null },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => m.transaction(fn),
  },
}))
vi.mock("@/lib/org-link", () => ({ lookupOrgLink: m.lookupOrgLink, rotateOrgLink: m.rotate }))
vi.mock("@/lib/org-link-send", () => ({ enqueueOrgLink: m.enqueue }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse: m.deliver }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit, getClientIp: () => "1.2.3.4" }))
vi.mock("@/lib/token-rate-limit", () => ({
  tokenLookupsBlocked: m.tokenLookupsBlocked,
  recordTokenMiss: m.recordTokenMiss,
  tokenUseAllowed: m.tokenUseAllowed,
}))

const target = {
  id: "v1",
  organizationId: "org-a",
  firstName: "Léa",
  lastName: "M",
  email: "lea@example.ch",
  organization: { id: "org-a", name: "Asso", slug: "asso", timeZone: "Europe/Zurich", active: true, suspendedAt: null },
}

const post = () => new Request("http://localhost/api/public/mes-inscriptions/tok/renouveler", { method: "POST" })

describe("POST /api/public/mes-inscriptions/[token]/renouveler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.current = { firstName: "Léa", lastName: "M", email: "lea@example.ch" }
    m.lookupOrgLink.mockResolvedValue(target)
    m.rateLimit.mockResolvedValue({ ok: true })
    m.tokenLookupsBlocked.mockResolvedValue(false)
    m.tokenUseAllowed.mockResolvedValue(true)
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      volunteer: {
        findFirst: vi.fn(async () => m.current),
      },
      registration: { findMany: m.regFindMany, update: m.regUpdate },
    }))
    m.regFindMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
    m.regUpdate.mockResolvedValue({})
    m.rotate.mockResolvedValue({ token: "new-token", issuedAt: new Date("2031-01-01") })
    m.enqueue.mockResolvedValue(["o1"])
  })

  it("conditions the rotation on the presented token's hash, queues the renewed email, delivers, and returns no token", async () => {
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(JSON.stringify(body)).not.toContain("new-token")
    expect(m.rotate).toHaveBeenCalledWith(expect.anything(), {
      volunteerId: "v1",
      organizationId: "org-a",
      expectedHash: hashToken("tok"),
    })
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      kind: "org_personal_link_renewed",
      volunteer: expect.objectContaining({ id: "v1", email: "lea@example.ch" }),
      organization: expect.objectContaining({ id: "org-a", name: "Asso", slug: "asso" }),
      link: expect.objectContaining({ token: "new-token" }),
    }))
    expect(m.deliver).toHaveBeenCalledWith(["o1"])
  })

  it("answers like an invalid link, and sends nothing, when another request already rotated it", async () => {
    m.rotate.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Ce lien ne fonctionne plus." })
    expect(m.enqueue).not.toHaveBeenCalled()
    expect(m.deliver).not.toHaveBeenCalled()
  })

  it("lets only one of two concurrent renewals with the same old token succeed", async () => {
    // A real conditional update, modelled on one row: the first update consumes the old hash, the
    // second finds a different value and loses.
    let storedHash = hashToken("tok")
    m.rotate.mockImplementation(async (_db: unknown, input: { expectedHash: string | null }) => {
      if (input.expectedHash !== storedHash) return null
      storedHash = hashToken("new-token")
      return { token: "new-token", issuedAt: new Date("2031-01-01") }
    })
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const statuses = await Promise.all([
      POST(post(), { params: Promise.resolve({ token: "tok" }) }).then((r) => r.status),
      POST(post(), { params: Promise.resolve({ token: "tok" }) }).then((r) => r.status),
    ])
    expect(statuses.sort()).toEqual([200, 404])
    expect(m.enqueue).toHaveBeenCalledTimes(1)
  })

  it("never sends to the old address when an address correction won the race", async () => {
    // The correction committed before the transaction: it replaced the token and the address.
    m.lookupOrgLink.mockResolvedValue({ ...target, email: "old@example.ch" })
    m.rotate.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(m.enqueue).not.toHaveBeenCalled()
  })

  it("reads the current address inside the transaction, after the rotation", async () => {
    m.current = { firstName: "Léa", lastName: "M", email: "new@example.ch" }
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    expect((await POST(post(), { params: Promise.resolve({ token: "tok" }) })).status).toBe(200)
    expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      volunteer: expect.objectContaining({ email: "new@example.ch" }),
    }))
  })

  it("refuses without rotating when the volunteer has no address", async () => {
    m.lookupOrgLink.mockResolvedValue({ ...target, email: null })
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Demande un nouveau lien à l'organisation.")
    expect(m.rotate).not.toHaveBeenCalled()
  })

  it("refuses while the organisation is suspended", async () => {
    m.lookupOrgLink.mockResolvedValue({ ...target, organization: { ...target.organization, active: false } })
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    expect((await POST(post(), { params: Promise.resolve({ token: "tok" }) })).status).toBe(403)
    expect(m.rotate).not.toHaveBeenCalled()
  })

  it("applies the IP and link rate limits with a next step", async () => {
    m.rateLimit.mockResolvedValue({ ok: false })
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe("Trop de tentatives. Réessaie dans une heure.")
    expect(m.lookupOrgLink).not.toHaveBeenCalled()
  })

  it("also rotates the event links of the volunteer's live registrations in this organisation (they were reachable from the old link)", async () => {
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(200)
    expect(m.regFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ volunteerId: "v1", event: { organizationId: "org-a" } }),
    }))
    expect(m.regUpdate.mock.calls.map((c) => c[0].where.id)).toEqual(["r1", "r2"])
    for (const c of m.regUpdate.mock.calls) expect(c[0].data.editTokenHash).toEqual(expect.any(String))
  })

  it("rotates no event link when the conditional rotation fails", async () => {
    m.rotate.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/mes-inscriptions/[token]/renouveler/route")
    const res = await POST(post(), { params: Promise.resolve({ token: "tok" }) })
    expect(res.status).toBe(404)
    expect(m.regUpdate).not.toHaveBeenCalled()
  })
})
