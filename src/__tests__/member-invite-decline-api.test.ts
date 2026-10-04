import { describe, it, expect, vi, beforeEach } from "vitest"

// POST /api/public/member-invite/[token]/decline (#558): the confirmation step of « Je ne suis
// pas disponible pour cet événement ». Rate limited per IP before any read, the same 404 for an
// unknown/foreign/inactive invite as the sibling GET route, idempotent, and logs memberinvite.declined
// with no personal data in `changes`.

const m = vi.hoisted(() => ({
  findInvite: vi.fn(),
  updateMany: vi.fn(),
  findOrg: vi.fn(),
  logCreate: vi.fn(),
  orgHeader: { value: null as string | null },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberInvite: { findUnique: m.findInvite, updateMany: m.updateMany },
    organization: { findUnique: m.findOrg },
    eventLog: { create: m.logCreate },
  },
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(m.orgHeader.value ? { "x-org-slug": m.orgHeader.value } : {}),
}))

const invite = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  volunteerId: "v1",
  eventId: "evt-1",
  declinedAt: null,
  volunteer: { active: true },
  event: { slug: "festival", organizationId: "org-a" },
  ...over,
})

let ipCounter = 0
const post = (token: string, opts: { slug?: string; xff?: string } = {}) =>
  new Request(`http://localhost/api/public/member-invite/${token}/decline${opts.slug ? `?slug=${opts.slug}` : ""}`, {
    method: "POST",
    headers: { "x-forwarded-for": opts.xff ?? `10.0.1.${++ipCounter}` },
  })
const call = async (req: Request, token = "tok") => {
  const { POST } = await import("@/app/api/public/member-invite/[token]/decline/route")
  return POST(req, { params: Promise.resolve({ token }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.orgHeader.value = null
  m.findInvite.mockResolvedValue(invite())
  m.updateMany.mockResolvedValue({ count: 1 })
  m.findOrg.mockImplementation(async ({ where }: { where: { slug: string } }) =>
    ({ "org-a-slug": { id: "org-a", slug: "org-a-slug" }, "org-b-slug": { id: "org-b", slug: "org-b-slug" } } as Record<string, unknown>)[where.slug] ?? null)
  m.logCreate.mockResolvedValue({ id: "log-1" })
})

describe("POST /api/public/member-invite/[token]/decline", () => {
  it("records the decline and logs memberinvite.declined with the volunteer as actor, no personal data", async () => {
    m.orgHeader.value = "org-a-slug"
    const res = await call(post("tok", { slug: "festival" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(m.updateMany).toHaveBeenCalledWith({ where: { id: "inv-1", declinedAt: null }, data: { declinedAt: expect.any(Date) } })
    expect(m.logCreate).toHaveBeenCalledOnce()
    const data = m.logCreate.mock.calls[0][0].data
    expect(data).toMatchObject({ action: "memberinvite.declined", entityType: "MemberInvite", entityId: "inv-1", actorType: "volunteer", actorId: "v1" })
    expect(data.changes).toBeUndefined()
  })

  it("is idempotent: a second confirmation changes nothing and is not logged again", async () => {
    m.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const first = await call(post("tok"))
    const second = await call(post("tok"))
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(m.logCreate).toHaveBeenCalledOnce()
  })

  it("answers every refusal the same way: unknown, inactive member, wrong event, foreign organization", async () => {
    const bodies: string[] = []
    m.findInvite.mockResolvedValueOnce(null)
    bodies.push(JSON.stringify(await (await call(post("nope"), "nope")).json()))
    m.findInvite.mockResolvedValueOnce(invite({ volunteer: { active: false } }))
    bodies.push(JSON.stringify(await (await call(post("tok"))).json()))
    bodies.push(JSON.stringify(await (await call(post("tok", { slug: "other-event" }))).json()))
    m.orgHeader.value = "org-b-slug"
    bodies.push(JSON.stringify(await (await call(post("tok"))).json()))
    expect(new Set(bodies)).toEqual(new Set(['{"error":"Lien invalide"}']))
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it("refuses the 11th decline within an hour from one IP, before reading anything", async () => {
    for (let i = 0; i < 10; i++) expect((await call(post("tok", { xff: "203.0.113.20" }))).status).toBe(200)
    m.findInvite.mockClear()
    const res = await call(post("tok", { xff: "203.0.113.20" }))
    expect(res.status).toBe(429)
    expect(m.findInvite).not.toHaveBeenCalled()
  })
})
