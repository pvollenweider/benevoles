import { describe, it, expect, vi, beforeEach } from "vitest"

const findFirst = vi.hoisted(() => vi.fn())
const update = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({ prisma: { registration: { findFirst }, volunteer: { update } } }))
const rateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, getClientIp: () => "1.2.3.4" }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { where: (t: string) => ({ editTokenHash: `h:${t}` }) } }))

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/org-log", () => ({ adminActor: () => ({ type: "admin" }), logOrgEvent: vi.fn(), diffFields: () => null }))

const patch = (body: unknown) =>
  new Request("http://localhost/api/public/registrations/tok/availability", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const params = { params: Promise.resolve({ token: "tok" }) }

// Optional availability (#402).
describe("PATCH /api/public/registrations/[token]/availability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimit.mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 })
    findFirst.mockResolvedValue({ volunteerId: "v1" })
    update.mockResolvedValue({ availabilityPeriods: ["morning"], availabilityNote: null })
  })

  it("saves the volunteer's availability behind a live token", async () => {
    const { PATCH } = await import("@/app/api/public/registrations/[token]/availability/route")
    const res = await PATCH(patch({ availabilityPeriods: ["morning"], availabilityNote: "  " }), params)
    expect(res.status).toBe(200)
    expect(findFirst.mock.calls[0][0].where).toEqual({ editTokenHash: "h:tok", status: "active" })
    expect(update).toHaveBeenCalledWith({ where: { id: "v1" }, data: { availabilityPeriods: ["morning"], availabilityNote: null }, select: { availabilityPeriods: true, availabilityNote: true } })
  })

  it("refuses an unknown period, an unknown or cancelled token, and too many attempts", async () => {
    const { PATCH } = await import("@/app/api/public/registrations/[token]/availability/route")
    expect((await PATCH(patch({ availabilityPeriods: ["night"], availabilityNote: null }), params)).status).toBe(400)
    findFirst.mockResolvedValue(null)
    expect((await PATCH(patch({ availabilityPeriods: [], availabilityNote: null }), params)).status).toBe(404)
    rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 60 })
    expect((await PATCH(patch({ availabilityPeriods: [], availabilityNote: null }), params)).status).toBe(429)
    expect(update).not.toHaveBeenCalled()
  })
})

describe("admin member routes accept availability", () => {
  const create = vi.fn()
  const memberUpdate = vi.fn()
  beforeEach(() => {
    vi.clearAllMocks()
    create.mockImplementation(async ({ data }: { data: object }) => ({ id: "m1", ...data }))
    memberUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: "m1", ...data }))
    requireOrgSessionMock.mockResolvedValue({
      db: { volunteer: { create, update: memberUpdate, findFirst: vi.fn().mockResolvedValue({ id: "m1", firstName: "A", lastName: "B", email: null, phone: null, tags: [], active: true }) } },
      organizationId: "org-a", session: { user: { email: "a@x.ch" } },
    })
  })

  it("POST and PATCH store periods and note", async () => {
    const { POST } = await import("@/app/api/admin/members/route")
    const res = await POST(new Request("http://localhost/api/admin/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: "Zoé", lastName: "Roy", availabilityPeriods: ["evening"], availabilityNote: "pas le lundi" }) }))
    expect(res.status).toBe(201)
    expect(create.mock.calls[0][0].data).toMatchObject({ availabilityPeriods: ["evening"], availabilityNote: "pas le lundi" })

    const { PATCH } = await import("@/app/api/admin/members/[id]/route")
    const res2 = await PATCH(new Request("http://localhost/api/admin/members/m1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ availabilityPeriods: [], availabilityNote: null }) }), { params: Promise.resolve({ id: "m1" }) })
    expect(res2.status).toBe(200)
    expect(memberUpdate.mock.calls[0][0].data).toMatchObject({ availabilityPeriods: [], availabilityNote: null })
  })
})
