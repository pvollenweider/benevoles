import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The roster of a member invitation (#1068 follow-up): GET /api/public/member-invite/[token]/roster.
 * An in-memory database answers the route's queries. An invited member, before signing up, sees
 * the names given under the current text only; a member with a confirmed place sees them as a
 * confirmed volunteer; nothing for another event's or organisation's invitation, a closed
 * invitation (declined, used), an unpublished event or an event without its roster.
 */

type Vol = { id: string; firstName: string; lastName: string; birthDate: Date | null; erasedAt: Date | null; mergedIntoId: string | null; active: boolean }
const db = vi.hoisted(() => ({
  invites: [] as { token: string; eventId: string; volunteerId: string; usedAt: Date | null; declinedAt: Date | null }[],
  events: new Map<string, { id: string; slug: string; organizationId: string; publicStatus: string; shiftRosterEnabled: boolean; personalDataAnonymizedAt: Date | null; startDate: Date; endDate: Date; organization: { timeZone: string } }>(),
  shifts: [] as { id: string; eventId: string; label: string; date: Date; startTime: string; endTime: string; status: string }[],
  volunteers: new Map<string, Vol>(),
  registrations: [] as { eventId: string; shiftId: string; volunteerId: string; status: string }[],
  consents: [] as { eventId: string; volunteerId: string; status: string; noticeVersion: string }[],
  host: "club" as string | null,
}))

vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => (k === "x-org-slug" ? db.host : null) }) }))
vi.mock("@/lib/resolve-org", () => ({ resolveOrgSlug: async (slug: string) => ({ org: { id: slug === "club" ? "org-a" : "org-b" } }) }))
vi.mock("@/lib/token-vault", () => ({ linkToken: { where: (t: string) => ({ token: t }) } }))
const rateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 }))
const isRateLimited = vi.hoisted(() => vi.fn().mockResolvedValue(false))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, isRateLimited, getClientIp: () => "1.2.3.4" }))

vi.mock("@/lib/prisma", () => {
  const volunteerSelect = (v: Vol) => ({ firstName: v.firstName, lastName: v.lastName, birthDate: v.birthDate, erasedAt: v.erasedAt, mergedIntoId: v.mergedIntoId })
  return {
    prisma: {
      memberInvite: {
        findUnique: async ({ where }: { where: { token: string } }) => {
          const i = db.invites.find((x) => x.token === where.token)
          if (!i) return null
          const v = db.volunteers.get(i.volunteerId)!
          return { volunteerId: i.volunteerId, usedAt: i.usedAt, declinedAt: i.declinedAt, volunteer: { active: v.active, erasedAt: v.erasedAt, mergedIntoId: v.mergedIntoId }, event: db.events.get(i.eventId)! }
        },
      },
      registration: {
        count: async ({ where }: { where: { volunteerId: string; eventId: string; status: string } }) =>
          db.registrations.filter((r) => r.volunteerId === where.volunteerId && r.eventId === where.eventId && r.status === where.status).length,
        findMany: async ({ where }: { where: { eventId: string; status: string } }) =>
          db.registrations.filter((r) => r.eventId === where.eventId && r.status === where.status)
            .map((r) => ({ shiftId: r.shiftId, volunteerId: r.volunteerId, status: r.status, volunteer: volunteerSelect(db.volunteers.get(r.volunteerId)!) })),
      },
      shift: {
        findMany: async ({ where }: { where: { eventId: string } }) =>
          db.shifts.filter((s) => s.eventId === where.eventId && s.status !== "cancelled").map(({ id, label, date, startTime, endTime }) => ({ id, label, date, startTime, endTime })),
      },
      rosterConsent: {
        findMany: async ({ where }: { where: { eventId: string; status?: string } }) =>
          db.consents.filter((c) => c.eventId === where.eventId && (!where.status || c.status === where.status)).map(({ volunteerId, status, noticeVersion }) => ({ volunteerId, status, noticeVersion })),
      },
    },
  }
})

const V1 = "2026-10-21"
const V2 = "2026-10-21.2"
const vol = (id: string, firstName: string, lastName: string, more: Partial<Vol> = {}): Vol => ({ id, firstName, lastName, birthDate: null, erasedAt: null, mergedIntoId: null, active: true, ...more })

function seed() {
  db.invites = []; db.shifts = []; db.registrations = []; db.consents = []; db.volunteers.clear(); db.events.clear(); db.host = "club"
  const ev = (id: string, slug: string, organizationId: string) => ({ id, slug, organizationId, publicStatus: "published", shiftRosterEnabled: true, personalDataAnonymizedAt: null, startDate: new Date("2099-10-01T00:00:00Z"), endDate: new Date("2099-10-01T00:00:00Z"), organization: { timeZone: "Europe/Zurich" } })
  db.events.set("ev-a", ev("ev-a", "fete", "org-a"))
  db.events.set("ev-b", ev("ev-b", "autre", "org-a"))
  const day = new Date("2099-10-01T00:00:00Z")
  db.shifts.push({ id: "bar", eventId: "ev-a", label: "Bar", date: day, startTime: "10:00", endTime: "12:00", status: "open" })
  for (const v of [vol("guest", "Gina", "Guest"), vol("old", "Odile", "Ancien"), vol("new", "Nora", "Nouveau"), vol("hid", "Hugo", "Hidden")]) db.volunteers.set(v.id, v)
  db.registrations.push(
    { eventId: "ev-a", shiftId: "bar", volunteerId: "old", status: "active" },
    { eventId: "ev-a", shiftId: "bar", volunteerId: "new", status: "active" },
    { eventId: "ev-a", shiftId: "bar", volunteerId: "hid", status: "active" },
  )
  db.consents.push(
    { eventId: "ev-a", volunteerId: "old", status: "visible", noticeVersion: V1 },
    { eventId: "ev-a", volunteerId: "new", status: "visible", noticeVersion: V2 },
  )
  db.invites.push({ token: "inv-guest", eventId: "ev-a", volunteerId: "guest", usedAt: null, declinedAt: null })
}

const get = async (token: string, slug: string | null = "fete") => {
  const { GET } = await import("@/app/api/public/member-invite/[token]/roster/route")
  const url = `http://localhost/api/public/member-invite/${token}/roster${slug ? `?slug=${slug}` : ""}`
  return GET(new Request(url), { params: Promise.resolve({ token }) })
}

describe("GET /api/public/member-invite/[token]/roster", () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })

  it("an invited member sees only names given under the current text; the rest is a count", async () => {
    const res = await get("inv-guest")
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    const body = await res.json()
    expect(body).toEqual({ available: true, shifts: [{ shiftId: "bar", label: "Bar", date: "2099-10-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00", names: ["Nora N."], othersCount: 2, own: false }] })
    const text = JSON.stringify(body)
    for (const leak of ["Odile", "Hugo", "Ancien", "Nouveau", "old", "new", "hid", "guest"]) expect(text).not.toContain(leak)
  })

  it("a member with a confirmed place sees the roster as a confirmed volunteer (first text included)", async () => {
    db.registrations.push({ eventId: "ev-a", shiftId: "bar", volunteerId: "guest", status: "active" })
    db.invites[0].usedAt = new Date()
    const body = await (await get("inv-guest")).json()
    expect(body.shifts[0]).toMatchObject({ names: ["Nora N.", "Odile A."], othersCount: 1, own: true })
  })

  it("a declined invitation, or one used to sign up without a confirmed place now: the same 404 as an unknown link", async () => {
    db.invites[0].declinedAt = new Date()
    expect((await get("inv-guest")).status).toBe(404)
    seed()
    db.invites[0].usedAt = new Date()
    db.registrations.push({ eventId: "ev-a", shiftId: "bar", volunteerId: "guest", status: "waiting" })
    expect((await get("inv-guest")).status).toBe(404)
  })

  it("nothing for an inactive, erased or merged member", async () => {
    for (const more of [{ active: false }, { erasedAt: new Date() }, { mergedIntoId: "x" }]) {
      seed()
      Object.assign(db.volunteers.get("guest")!, more)
      expect((await get("inv-guest")).status).toBe(404)
    }
  })

  it("nothing when the event is a draft, has no roster, is over or anonymised", async () => {
    for (const more of [{ publicStatus: "draft" }, { shiftRosterEnabled: false }, { endDate: new Date("2020-01-01T00:00:00Z") }, { personalDataAnonymizedAt: new Date() }]) {
      seed()
      Object.assign(db.events.get("ev-a")!, more)
      const res = await get("inv-guest")
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: "Lien invalide" })
    }
  })

  it("the same 404 for an unknown token, another event's slug, a missing slug, another organisation's site or no site", async () => {
    const answers = [
      await get("nope"),
      await get("inv-guest", "autre"),
      await get("inv-guest", null),
      await (async () => { db.host = "other"; return get("inv-guest") })(),
      await (async () => { db.host = null; return get("inv-guest") })(),
    ]
    for (const res of answers) {
      expect(res.status).toBe(404)
      expect(res.headers.get("Cache-Control")).toBe("private, no-store")
      expect(await res.json()).toEqual({ error: "Lien invalide" })
    }
    // Each refusal counts against the client's address.
    expect(rateLimit).toHaveBeenCalledWith("1.2.3.4", "member-invite-roster-miss", 20, 3600000)
  })

  it("refused once the client used up its misses, even with a valid invitation", async () => {
    isRateLimited.mockResolvedValueOnce(true)
    expect((await get("inv-guest")).status).toBe(429)
  })
})
