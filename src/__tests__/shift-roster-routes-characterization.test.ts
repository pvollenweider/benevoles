import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Byte-for-byte record of what the two roster routes answer (#1068): the personal link's GET and
 * PATCH (/api/public/registrations/[token]/roster) and the member invitation's GET
 * (/api/public/member-invite/[token]/roster), over one event with every kind of volunteer. An
 * in-memory database answers their queries by their `where`. A refactor of src/lib/shift-roster*.ts
 * or src/lib/roster-read.ts must leave every status, header and body as recorded. A failing
 * snapshot after an intended change: review the diff, then update with `npx vitest run -u`.
 */

type Vol = { id: string; firstName: string; lastName: string; birthDate: Date | null; erasedAt: Date | null; mergedIntoId: string | null; active: boolean }
type Consent = { eventId: string; volunteerId: string; status: string; noticeVersion: string; source?: string; decidedAt?: Date }
type Ev = { id: string; slug: string; organizationId: string; publicStatus: string; shiftRosterEnabled: boolean; personalDataAnonymizedAt: Date | null; startDate: Date; endDate: Date; organization: { timeZone: string } }

const db = vi.hoisted(() => ({
  events: new Map<string, Ev>(),
  shifts: [] as { id: string; eventId: string; label: string; date: Date; startTime: string; endTime: string; status: string }[],
  volunteers: new Map<string, Vol>(),
  registrations: [] as { token: string; eventId: string; shiftId: string; volunteerId: string; status: string }[],
  consents: [] as Consent[],
  invites: [] as { token: string; eventId: string; volunteerId: string; usedAt: Date | null; declinedAt: Date | null }[],
}))
const logEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/event-log", () => ({ logEvent }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => (k === "x-org-slug" ? "club" : null) }) }))
vi.mock("@/lib/resolve-org", () => ({ resolveOrgSlug: async () => ({ org: { id: "org-a" } }) }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { where: (t: string) => ({ token: t }) }, linkToken: { where: (t: string) => ({ token: t }) } }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ ok: true, remaining: 1, retryAfter: 0 }), isRateLimited: async () => false, getClientIp: () => "1.2.3.4" }))

vi.mock("@/lib/prisma", () => {
  const statusOk = (status: string, filter: unknown) =>
    filter === undefined ? true : typeof filter === "string" ? status === filter : (filter as { in: string[] }).in.includes(status)
  const volunteerSelect = (v: Vol) => ({ firstName: v.firstName, lastName: v.lastName, birthDate: v.birthDate, erasedAt: v.erasedAt, mergedIntoId: v.mergedIntoId })
  const key = (w: { eventId_volunteerId: { eventId: string; volunteerId: string } }) => w.eventId_volunteerId
  const rosterConsent = {
    findMany: async ({ where }: { where: { eventId: string; status?: string } }) =>
      db.consents.filter((c) => c.eventId === where.eventId && (!where.status || c.status === where.status)).map(({ volunteerId, status, noticeVersion }) => ({ volunteerId, status, noticeVersion })),
    findUnique: async ({ where }: { where: { eventId_volunteerId: { eventId: string; volunteerId: string } } }) => {
      const k = key(where)
      const c = db.consents.find((x) => x.eventId === k.eventId && x.volunteerId === k.volunteerId)
      return c ? { status: c.status, noticeVersion: c.noticeVersion } : null
    },
    upsert: async ({ where, create, update }: { where: { eventId_volunteerId: { eventId: string; volunteerId: string } }; create: Consent; update: Partial<Consent> }) => {
      const k = key(where)
      const c = db.consents.find((x) => x.eventId === k.eventId && x.volunteerId === k.volunteerId)
      if (c) Object.assign(c, update)
      else db.consents.push({ ...create })
    },
  }
  const prisma = {
    registration: {
      findFirst: async ({ where }: { where: { token: string; status: { in: string[] } } }) => {
        const r = db.registrations.find((x) => x.token === where.token && statusOk(x.status, where.status))
        if (!r) return null
        return { volunteerId: r.volunteerId, eventId: r.eventId, volunteer: volunteerSelect(db.volunteers.get(r.volunteerId)!), event: db.events.get(r.eventId)! }
      },
      count: async ({ where }: { where: { volunteerId: string; eventId: string; status: string } }) =>
        db.registrations.filter((r) => r.volunteerId === where.volunteerId && r.eventId === where.eventId && r.status === where.status).length,
      findMany: async ({ where }: { where: { eventId: string; status: string } }) =>
        db.registrations.filter((r) => r.eventId === where.eventId && statusOk(r.status, where.status))
          .map((r) => ({ shiftId: r.shiftId, volunteerId: r.volunteerId, status: r.status, volunteer: volunteerSelect(db.volunteers.get(r.volunteerId)!) })),
    },
    shift: {
      findMany: async ({ where }: { where: { eventId: string } }) =>
        db.shifts.filter((s) => s.eventId === where.eventId && s.status !== "cancelled").map(({ id, label, date, startTime, endTime }) => ({ id, label, date, startTime, endTime })),
    },
    memberInvite: {
      findUnique: async ({ where }: { where: { token: string } }) => {
        const i = db.invites.find((x) => x.token === where.token)
        if (!i) return null
        const v = db.volunteers.get(i.volunteerId)!
        return { volunteerId: i.volunteerId, usedAt: i.usedAt, declinedAt: i.declinedAt, volunteer: { active: v.active, erasedAt: v.erasedAt, mergedIntoId: v.mergedIntoId }, event: db.events.get(i.eventId)! }
      },
    },
    rosterConsent,
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      rosterConsent,
      $queryRaw: async (_s: TemplateStringsArray, id: string) => {
        const v = db.volunteers.get(id)
        return v && !v.erasedAt ? [{ id }] : []
      },
    }),
  }
  return { prisma }
})

const V1 = "2026-10-21"
const V2 = "2026-10-21.2"
const vol = (id: string, firstName: string, lastName: string, more: Partial<Vol> = {}): Vol =>
  ({ id, firstName, lastName, birthDate: null, erasedAt: null, mergedIntoId: null, active: true, ...more })

function seed() {
  db.events.clear(); db.volunteers.clear(); db.shifts.length = 0; db.registrations.length = 0; db.consents.length = 0; db.invites.length = 0
  const ev = (id: string, slug: string): Ev => ({ id, slug, organizationId: "org-a", publicStatus: "published", shiftRosterEnabled: true, personalDataAnonymizedAt: null, startDate: new Date("2099-10-01T00:00:00Z"), endDate: new Date("2099-10-02T00:00:00Z"), organization: { timeZone: "Europe/Zurich" } })
  db.events.set("ev-a", ev("ev-a", "fete"))
  db.events.set("ev-b", ev("ev-b", "autre"))
  const d1 = new Date("2099-10-01T00:00:00Z")
  const d2 = new Date("2099-10-02T00:00:00Z")
  db.shifts.push(
    { id: "bar", eventId: "ev-a", label: "Bar", date: d1, startTime: "10:00", endTime: "12:00", status: "open" },
    { id: "accueil", eventId: "ev-a", label: "Accueil", date: d1, startTime: "14:00", endTime: "16:00", status: "open" },
    { id: "vide", eventId: "ev-a", label: "Vide", date: d1, startTime: "16:00", endTime: "18:00", status: "open" },
    { id: "annule", eventId: "ev-a", label: "Annulé", date: d1, startTime: "18:00", endTime: "20:00", status: "cancelled" },
    { id: "rangement", eventId: "ev-a", label: "Rangement", date: d2, startTime: "08:00", endTime: "10:00", status: "open" },
    { id: "b-shift", eventId: "ev-b", label: "Autre", date: d1, startTime: "10:00", endTime: "12:00", status: "open" },
  )
  for (const v of [
    vol("me", "Moi", "Même"), vol("aline", "Aline", "Martin"), vol("odile", "Odile", "Ancien"), vol("bruno", "Bruno", "Keller"),
    vol("chloe", "Chloé", "Roux"), vol("nina", "Nina", "Sanschoix"), vol("max", "Max", "Mineur", { birthDate: new Date("2085-01-01T00:00:00Z") }),
    vol("eric", "Eric", "Efface", { erasedAt: new Date("2026-01-01T00:00:00Z") }), vol("mona", "Mona", "Fusion", { mergedIntoId: "aline" }),
    vol("lea1", "Léa", "Favre"), vol("lea2", "Léa", "Fontaine"), vol("emile", "Émile", "Zola"), vol("wanda", "Wanda", "Waiting"),
    vol("bob", "Bob", "Bernard"), vol("guest", "Gina", "Guest"), vol("member", "Marc", "Membre"),
  ]) db.volunteers.set(v.id, v)
  const reg = (token: string, eventId: string, shiftId: string, volunteerId: string, status = "active") => db.registrations.push({ token, eventId, shiftId, volunteerId, status })
  reg("tok-me", "ev-a", "bar", "me")
  reg("tok-me-2", "ev-a", "rangement", "me")
  reg("tok-aline", "ev-a", "bar", "aline")
  reg("tok-aline-2", "ev-a", "accueil", "aline")
  reg("tok-odile", "ev-a", "bar", "odile")
  reg("tok-bruno", "ev-a", "bar", "bruno")
  reg("tok-chloe", "ev-a", "accueil", "chloe")
  reg("tok-nina", "ev-a", "accueil", "nina")
  reg("tok-max", "ev-a", "bar", "max")
  reg("tok-eric", "ev-a", "bar", "eric")
  reg("tok-mona", "ev-a", "bar", "mona")
  reg("tok-lea1", "ev-a", "rangement", "lea1")
  reg("tok-lea2", "ev-a", "rangement", "lea2")
  reg("tok-emile", "ev-a", "rangement", "emile")
  reg("tok-wanda", "ev-a", "accueil", "wanda", "waiting")
  reg("tok-annule", "ev-a", "annule", "aline")
  reg("tok-member", "ev-a", "accueil", "member")
  reg("tok-bob", "ev-b", "b-shift", "bob")
  const consent = (volunteerId: string, status: string, noticeVersion: string, eventId = "ev-a") => db.consents.push({ eventId, volunteerId, status, noticeVersion })
  consent("me", "hidden", V2)
  consent("aline", "visible", V2)
  consent("odile", "visible", V1)
  consent("bruno", "pending", V2)
  consent("chloe", "hidden", V2)
  consent("max", "visible", V2)
  consent("eric", "visible", V2)
  consent("mona", "visible", V2)
  consent("lea1", "visible", V2)
  consent("lea2", "visible", V1)
  consent("emile", "visible", "1999-01-01")
  consent("wanda", "visible", V2)
  consent("bob", "visible", V2, "ev-b")
  db.invites.push(
    { token: "inv-guest", eventId: "ev-a", volunteerId: "guest", usedAt: null, declinedAt: null },
    { token: "inv-member", eventId: "ev-a", volunteerId: "member", usedAt: new Date("2026-10-01T00:00:00Z"), declinedAt: null },
    { token: "inv-declined", eventId: "ev-a", volunteerId: "nina", usedAt: null, declinedAt: new Date("2026-10-01T00:00:00Z") },
  )
}

async function answer(res: Response) {
  return { status: res.status, cache: res.headers.get("Cache-Control"), body: await res.json() }
}
const personalUrl = (token: string) => `http://localhost/api/public/registrations/${token}/roster`
const get = async (token: string) => {
  const { GET } = await import("@/app/api/public/registrations/[token]/roster/route")
  return answer(await GET(new Request(personalUrl(token)), { params: Promise.resolve({ token }) }))
}
const patch = async (token: string, body: unknown) => {
  const { PATCH } = await import("@/app/api/public/registrations/[token]/roster/route")
  return answer(await PATCH(new Request(personalUrl(token), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) }))
}
const invite = async (token: string, slug = "fete") => {
  const { GET } = await import("@/app/api/public/member-invite/[token]/roster/route")
  return answer(await GET(new Request(`http://localhost/api/public/member-invite/${token}/roster?slug=${slug}`), { params: Promise.resolve({ token }) }))
}

describe("shift roster routes characterization (#1068)", () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })

  it("GET of every personal link of the event", async () => {
    const out: Record<string, unknown> = {}
    for (const token of ["tok-me", "tok-me-2", "tok-aline", "tok-odile", "tok-bruno", "tok-chloe", "tok-max", "tok-eric", "tok-mona", "tok-emile", "tok-wanda", "tok-annule", "tok-bob", "nope"]) out[token] = await get(token)
    expect(out).toMatchSnapshot()
  })

  it("GET when the roster is closed", async () => {
    const out: unknown[] = []
    for (const more of [{ shiftRosterEnabled: false }, { personalDataAnonymizedAt: new Date() }, { endDate: new Date("2020-01-01T00:00:00Z") }]) {
      seed()
      Object.assign(db.events.get("ev-a")!, more)
      out.push(await get("tok-me"), await invite("inv-guest"))
    }
    expect(out).toMatchSnapshot()
  })

  it("PATCH: show, widen, hide, a minor, a bad request", async () => {
    const out: unknown[] = [
      await patch("tok-me", { visible: true, noticeVersion: V2 }),
      await patch("tok-me", { visible: true, noticeVersion: V2 }),
      await patch("tok-me", { visible: false }),
      await patch("tok-odile", { visible: true }),
      await patch("tok-odile", { visible: true, noticeVersion: V2 }),
      await patch("tok-bruno", { visible: true, noticeVersion: "inconnue" }),
      await patch("tok-max", { visible: true, noticeVersion: V2 }),
      await patch("tok-max", { visible: false }),
      await patch("tok-me", { visible: "oui" }),
      await patch("nope", { visible: true }),
    ]
    expect({ out, consents: db.consents.map(({ volunteerId, status, noticeVersion, source }) => ({ volunteerId, status, noticeVersion, source })), log: logEvent.mock.calls.map(([e]) => ({ action: e.action, actor: e.actor, changes: e.changes })) }).toMatchSnapshot()
  })

  it("GET of member invitations: invited, confirmed, declined, another event", async () => {
    const out: Record<string, unknown> = {}
    out["inv-guest"] = await invite("inv-guest")
    out["inv-member"] = await invite("inv-member")
    out["inv-declined"] = await invite("inv-declined")
    out["inv-guest/autre"] = await invite("inv-guest", "autre")
    out["unknown"] = await invite("nope")
    db.registrations.push({ token: "tok-guest", eventId: "ev-a", shiftId: "vide", volunteerId: "guest", status: "active" })
    out["inv-guest/now confirmed"] = await invite("inv-guest")
    expect(out).toMatchSnapshot()
  })
})
