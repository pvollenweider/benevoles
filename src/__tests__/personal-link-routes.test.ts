import { describe, it, expect, vi, beforeEach } from "vitest"

// Personal links (#376): re-send from the personal page, request by email when the link is lost.

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  rateLimit: vi.fn().mockResolvedValue({ ok: true }),
  enqueue: vi.fn().mockResolvedValue(["n1"]),
  deliver: vi.fn(),
  headers: vi.fn(),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst: m.findFirst, findMany: m.findMany, updateMany: m.updateMany } } }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit, getClientIp: () => "1.2.3.4" }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: m.enqueue, deliverAfterResponse: m.deliver }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { where: (t: string) => ({ editTokenHash: `h:${t}` }), reveal: () => "tok-clear" } }))
vi.mock("next/headers", () => ({ headers: m.headers }))

const reg = {
  id: "r1", eventId: "e1", volunteerId: "v1", editTokenHash: "h", editTokenEnc: null, editTokenLegacy: null,
  volunteer: { firstName: "A", lastName: "B", email: "a@x.ch" },
  event: { id: "e1", title: "Fête", organizationId: "org-a", organization: { slug: "org" } },
}

describe("POST /api/public/registrations/[token]/resend-link", () => {
  beforeEach(() => { vi.clearAllMocks(); m.rateLimit.mockResolvedValue({ ok: true }); m.updateMany.mockResolvedValue({ count: 1 }) })

  it("re-sends the link of a live registration, stamps linkEmailedAt, delivers after the response", async () => {
    m.findFirst.mockResolvedValue(reg)
    const { POST } = await import("@/app/api/public/registrations/[token]/resend-link/route")
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ token: "t" }) })
    expect(res.status).toBe(200)
    expect(m.findFirst.mock.calls[0][0].where).toMatchObject({ editTokenHash: "h:t", status: { in: ["active", "waiting", "offered", "requested"] } })
    expect(m.enqueue).toHaveBeenCalledWith([expect.objectContaining({ kind: "registration_link_resend", organizationId: "org-a", recipient: { email: "a@x.ch", name: "A B" } })])
    expect(m.updateMany).toHaveBeenCalledWith({ where: { volunteerId: "v1", eventId: "e1", status: { in: ["active", "waiting", "offered", "requested"] } }, data: { linkEmailedAt: expect.any(Date) } })
    expect(m.deliver).toHaveBeenCalledWith(["n1"])
  })

  it("404 for an unknown token, 429 when the volunteer already asked three times this hour", async () => {
    m.findFirst.mockResolvedValue(null)
    const { POST } = await import("@/app/api/public/registrations/[token]/resend-link/route")
    expect((await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ token: "nope" }) })).status).toBe(404)

    m.findFirst.mockResolvedValue(reg)
    m.rateLimit.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false }) // ip ok, volunteer throttled
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ token: "t" }) })
    expect(res.status).toBe(429)
    expect(m.enqueue).not.toHaveBeenCalled()
  })
})

describe("POST /api/public/registrations/link", () => {
  beforeEach(() => { vi.clearAllMocks(); m.rateLimit.mockResolvedValue({ ok: true }); m.headers.mockResolvedValue(new Headers({ "x-org-slug": "org" })) })

  const post = (body: unknown) => new Request("http://localhost/api/public/registrations/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  it("answers the same whether the address is known or not, scoped to the organization, one email per event", async () => {
    m.findMany.mockResolvedValue([reg, { ...reg, id: "r2" }, { ...reg, id: "r3", eventId: "e2", event: { ...reg.event, id: "e2", title: "Autre" } }])
    const { POST } = await import("@/app/api/public/registrations/link/route")
    const res = await POST(post({ email: "A@x.ch" }))
    expect(res.status).toBe(200)
    expect((await res.json()).message).toMatch(/^Si une inscription existe/)
    const where = m.findMany.mock.calls[0][0].where
    expect(where.volunteer).toEqual({ email: { equals: "a@x.ch", mode: "insensitive" }, organization: { slug: "org" } })
    expect(m.enqueue).toHaveBeenCalledTimes(2)

    m.findMany.mockResolvedValue([])
    const unknown = await POST(post({ email: "nobody@x.ch" }))
    expect(unknown.status).toBe(200)
    expect((await unknown.json()).message).toMatch(/^Si une inscription existe/)
  })

  it("rejects a malformed address and sends nothing without the proxy header (a ?org= alone is ignored)", async () => {
    const { POST } = await import("@/app/api/public/registrations/link/route")
    expect((await POST(post({ email: "not-an-email" }))).status).toBe(400)
    m.headers.mockResolvedValue(new Headers())
    const spoof = new Request("http://localhost/api/public/registrations/link?org=other", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@x.ch" }) })
    expect((await POST(spoof)).status).toBe(200)
    expect(m.findMany).not.toHaveBeenCalled()
  })
})
