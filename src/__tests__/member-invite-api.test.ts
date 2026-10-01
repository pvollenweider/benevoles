import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// #541: GET /api/public/member-invite/[token] returns the member's name, email and phone to
// pre-fill the sign-up form. It had no rate limit, and checked the event slug but not the
// organization of the host (event slugs are only unique per organization).

const m = vi.hoisted(() => ({
  findInvite: vi.fn(),
  findOrg: vi.fn(),
  findHistory: vi.fn(),
  orgHeader: { value: null as string | null },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memberInvite: { findUnique: m.findInvite },
    organization: { findUnique: m.findOrg },
    orgSlugHistory: { findUnique: m.findHistory },
  },
}))
vi.mock("next/headers", () => ({
  headers: async () => new Headers(m.orgHeader.value ? { "x-org-slug": m.orgHeader.value } : {}),
}))

const invite = (over: Record<string, unknown> = {}) => ({
  volunteer: { id: "v1", firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: "079 000 00 00", active: true, tags: [] },
  event: { slug: "festival", organizationId: "org-a", shifts: [] },
  ...over,
})

let ipCounter = 0
/** A request from its own IP unless one is given, so tests don't share a rate-limit window. */
const get = (token: string, opts: { slug?: string; xff?: string } = {}) =>
  new Request(`http://localhost/api/public/member-invite/${token}${opts.slug ? `?slug=${opts.slug}` : ""}`, {
    headers: { "x-forwarded-for": opts.xff ?? `10.0.0.${++ipCounter}` },
  })
const call = async (req: Request, token = "tok") => {
  const { GET } = await import("@/app/api/public/member-invite/[token]/route")
  return GET(req, { params: Promise.resolve({ token }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.orgHeader.value = null
  m.findInvite.mockResolvedValue(invite())
  m.findOrg.mockImplementation(async ({ where }: { where: { slug: string } }) =>
    ({ "org-a-slug": { id: "org-a", slug: "org-a-slug", name: "A", publicTitle: null }, "org-b-slug": { id: "org-b", slug: "org-b-slug", name: "B", publicTitle: null } } as Record<string, unknown>)[where.slug] ?? null)
  m.findHistory.mockResolvedValue(null)
})
afterEach(() => vi.useRealTimers())

describe("GET /api/public/member-invite/[token] — answers", () => {
  it("pre-fills the member on the organization's own site", async () => {
    m.orgHeader.value = "org-a-slug"
    const res = await call(get("tok", { slug: "festival" }))
    expect(res.status).toBe(200)
    expect((await res.json()).member).toEqual({ firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: "079 000 00 00" })
  })

  it("refuses an invitation of another organization, even for an event with the same slug", async () => {
    m.orgHeader.value = "org-b-slug"
    const res = await call(get("tok", { slug: "festival" }))
    expect(res.status).toBe(404)
    expect(JSON.stringify(await res.json())).not.toContain("alice")
  })

  it("refuses on an unknown organization host", async () => {
    m.orgHeader.value = "nobody"
    expect((await call(get("tok", { slug: "festival" }))).status).toBe(404)
  })

  it("answers every refusal the same way: unknown, deactivated member, other event, other organization", async () => {
    const bodies: string[] = []
    m.findInvite.mockResolvedValueOnce(null)
    bodies.push(JSON.stringify(await (await call(get("nope"), "nope")).json()))
    m.findInvite.mockResolvedValueOnce(invite({ volunteer: { ...invite().volunteer, active: false } }))
    bodies.push(JSON.stringify(await (await call(get("tok"))).json()))
    bodies.push(JSON.stringify(await (await call(get("tok", { slug: "other-event" }))).json()))
    m.orgHeader.value = "org-b-slug"
    bodies.push(JSON.stringify(await (await call(get("tok"))).json()))
    expect(new Set(bodies)).toEqual(new Set(['{"error":"Lien invalide"}']))
  })
})

describe("GET /api/public/member-invite/[token] — rate limit", () => {
  it("refuses the 31st read within an hour from one IP, before reading anything", async () => {
    for (let i = 0; i < 30; i++) expect((await call(get("tok", { xff: "203.0.113.7" }))).status).toBe(200)
    m.findInvite.mockClear()
    const res = await call(get("tok", { xff: "203.0.113.7" }))
    expect(res.status).toBe(429)
    expect(m.findInvite).not.toHaveBeenCalled()
  })

  it("opens again once the hour has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"))
    for (let i = 0; i < 30; i++) await call(get("tok", { xff: "203.0.113.8" }))
    expect((await call(get("tok", { xff: "203.0.113.8" }))).status).toBe(429)
    vi.setSystemTime(new Date("2026-10-01T11:00:01Z"))
    expect((await call(get("tok", { xff: "203.0.113.8" }))).status).toBe(200)
  })

  it("counts the IP added by our proxy, not the one the client claims", async () => {
    // X-Forwarded-For: <whatever the client sent>, <what Traefik saw>. A new fake leftmost
    // entry on each request must not open a fresh window.
    for (let i = 0; i < 30; i++) await call(get("tok", { xff: `1.2.3.${i}, 198.51.100.9` }))
    expect((await call(get("tok", { xff: "9.9.9.9, 198.51.100.9" }))).status).toBe(429)
    expect((await call(get("tok", { xff: "198.51.100.10" }))).status).toBe(200)
  })
})
