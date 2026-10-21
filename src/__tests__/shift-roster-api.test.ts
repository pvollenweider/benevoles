import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * The shift roster of a personal page (#1068): GET /api/public/registrations/[token]/roster and its
 * PATCH. An in-memory database answers the route's queries by their `where`, so the test checks
 * what a link of event A can reach: never event B, never a hidden or pending name, never another
 * volunteer's id or field, nothing without a confirmed place.
 */

type Reg = { id: string; token: string; eventId: string; shiftId: string; volunteerId: string; status: string }
type Vol = { id: string; firstName: string; lastName: string; birthDate: Date | null; erasedAt: Date | null; mergedIntoId: string | null; email: string; phone: string }
type Consent = { eventId: string; volunteerId: string; status: string; noticeVersion?: string; source?: string; decidedAt?: Date }

const db = vi.hoisted(() => ({
  events: new Map<string, { id: string; shiftRosterEnabled: boolean; personalDataAnonymizedAt: Date | null; startDate: Date; endDate: Date; organization: { timeZone: string } }>(),
  shifts: [] as { id: string; eventId: string; label: string; date: Date; startTime: string; endTime: string; status: string }[],
  volunteers: new Map<string, Vol>(),
  registrations: [] as Reg[],
  consents: [] as Consent[],
}))
const logEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/event-log", () => ({ logEvent }))
vi.mock("@/lib/token-vault", () => ({ registrationToken: { where: (t: string) => ({ token: t }) } }))
const rateLimit = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, remaining: 1, retryAfter: 0 }))
const isRateLimited = vi.hoisted(() => vi.fn().mockResolvedValue(false))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, isRateLimited, getClientIp: () => "1.2.3.4" }))

vi.mock("@/lib/prisma", () => {
  const statusOk = (status: string, filter: unknown) =>
    filter === undefined ? true : typeof filter === "string" ? status === filter : (filter as { in: string[] }).in.includes(status)
  const volunteerSelect = (v: Vol) => ({ firstName: v.firstName, lastName: v.lastName, birthDate: v.birthDate, erasedAt: v.erasedAt, mergedIntoId: v.mergedIntoId })
  const rosterConsent = {
    findMany: async ({ where }: { where: { eventId: string; status?: string } }) =>
      db.consents.filter((c) => c.eventId === where.eventId && (!where.status || c.status === where.status)).map((c) => ({ volunteerId: c.volunteerId, status: c.status, noticeVersion: c.noticeVersion ?? "2026-10-21.2" })),
    findUnique: async ({ where }: { where: { eventId_volunteerId: { eventId: string; volunteerId: string } } }) => {
      const k = where.eventId_volunteerId
      const c = db.consents.find((x) => x.eventId === k.eventId && x.volunteerId === k.volunteerId)
      return c ? { status: c.status, noticeVersion: c.noticeVersion ?? "2026-10-21.2" } : null
    },
    upsert: async ({ where, create, update }: { where: { eventId_volunteerId: { eventId: string; volunteerId: string } }; create: Consent; update: Partial<Consent> }) => {
      const k = where.eventId_volunteerId
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
        const e = db.events.get(r.eventId)!
        return { volunteerId: r.volunteerId, eventId: r.eventId, volunteer: volunteerSelect(db.volunteers.get(r.volunteerId)!), event: e }
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

const vol = (id: string, firstName: string, lastName: string, more: Partial<Vol> = {}): Vol =>
  ({ id, firstName, lastName, birthDate: null, erasedAt: null, mergedIntoId: null, email: `${id}@example.com`, phone: "079 000 00 00", ...more })

function seed() {
  db.events.clear(); db.volunteers.clear(); db.shifts.length = 0; db.registrations.length = 0; db.consents.length = 0
  const event = (id: string) => ({ id, shiftRosterEnabled: true, personalDataAnonymizedAt: null, startDate: new Date("2099-10-01T00:00:00Z"), endDate: new Date("2099-10-02T00:00:00Z"), organization: { timeZone: "Europe/Zurich" } })
  db.events.set("ev-a", event("ev-a"))
  db.events.set("ev-b", event("ev-b"))
  const day = new Date("2099-10-01T00:00:00Z")
  db.shifts.push(
    { id: "bar", eventId: "ev-a", label: "Bar", date: day, startTime: "10:00", endTime: "12:00", status: "open" },
    { id: "accueil", eventId: "ev-a", label: "Accueil", date: day, startTime: "14:00", endTime: "16:00", status: "open" },
    { id: "b-shift", eventId: "ev-b", label: "Autre", date: day, startTime: "10:00", endTime: "12:00", status: "open" },
  )
  for (const v of [vol("me", "Moi", "Même"), vol("aline", "Aline", "Martin"), vol("bruno", "Bruno", "Keller"), vol("chloe", "Chloé", "Roux"), vol("waiter", "Wanda", "Waiting"), vol("bob", "Bob", "Bernard")]) db.volunteers.set(v.id, v)
  const reg = (id: string, eventId: string, shiftId: string, volunteerId: string, status = "active") =>
    db.registrations.push({ id, token: `tok-${id}`, eventId, shiftId, volunteerId, status })
  reg("r-me", "ev-a", "bar", "me")
  reg("r-aline", "ev-a", "accueil", "aline") // not on the viewer's shift: still listed (event-wide)
  reg("r-bruno", "ev-a", "bar", "bruno")
  reg("r-chloe", "ev-a", "bar", "chloe")
  reg("r-waiter", "ev-a", "bar", "waiter", "waiting")
  reg("r-bob", "ev-b", "b-shift", "bob")
  db.consents.push(
    { eventId: "ev-a", volunteerId: "aline", status: "visible" },
    { eventId: "ev-a", volunteerId: "bruno", status: "pending" },
    { eventId: "ev-a", volunteerId: "chloe", status: "hidden" },
    { eventId: "ev-a", volunteerId: "waiter", status: "visible" },
    { eventId: "ev-b", volunteerId: "bob", status: "visible" },
  )
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })
const get = async (token: string) => {
  const { GET } = await import("@/app/api/public/registrations/[token]/roster/route")
  return GET(new Request(`http://localhost/api/public/registrations/${token}/roster`), params(token))
}
const patch = async (token: string, body: unknown) => {
  const { PATCH } = await import("@/app/api/public/registrations/[token]/roster/route")
  return PATCH(new Request(`http://localhost/api/public/registrations/${token}/roster`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), params(token))
}

describe("GET /api/public/registrations/[token]/roster (#1068)", () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })

  it("names the visible, confirmed volunteers of the event, shift by shift, and nothing else", async () => {
    const res = await get("tok-r-me")
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("private, no-store")
    const body = await res.json()
    expect(body).toEqual({
      available: true,
      displayName: "Moi M.",
      state: "hidden",
      shifts: [
        // Bruno (pending) and Chloé (hidden) are on the viewer's shift: counted, never named; the
        // waitlisted Wanda and the viewer are not counted.
        { shiftId: "bar", label: "Bar", date: "2099-10-01T00:00:00.000Z", startTime: "10:00", endTime: "12:00", names: [], othersCount: 2, own: true },
        { shiftId: "accueil", label: "Accueil", date: "2099-10-01T00:00:00.000Z", startTime: "14:00", endTime: "16:00", names: ["Aline M."], othersCount: 0, own: false },
      ],
    })
    // Only display strings and bare counts per shift: no field about the hidden people.
    for (const s of body.shifts) expect(Object.keys(s).sort()).toEqual(["date", "endTime", "label", "names", "othersCount", "own", "shiftId", "startTime"])
    const text = JSON.stringify(body)
    // Pending, hidden, waitlisted: never in the payload. No ids, emails, phones or full names.
    for (const leak of ["Bruno", "Chloé", "Wanda", "aline", "bruno", "chloe", "waiter", "Martin", "Keller", "Roux", "pending", "@example.com", "079"]) expect(text).not.toContain(leak)
  })

  it("a link of event A never sees event B", async () => {
    const a = JSON.stringify(await (await get("tok-r-me")).json())
    expect(a).not.toContain("Bob")
    expect(a).not.toContain("Autre")
    const b = await (await get("tok-r-bob")).json()
    // Bob is alone on B: his own shift with nobody else, and nothing of A.
    expect(b).toMatchObject({ available: true, shifts: [{ shiftId: "b-shift", names: [], othersCount: 0, own: true }] })
    expect(JSON.stringify(b)).not.toContain("Aline")
  })

  it("nothing without a confirmed place on the event: a waitlisted-only volunteer sees no names", async () => {
    expect(await (await get("tok-r-waiter")).json()).toEqual({ available: false })
  })

  it("nothing when the setting is off, the event over or anonymised", async () => {
    db.events.get("ev-a")!.shiftRosterEnabled = false
    expect(await (await get("tok-r-me")).json()).toEqual({ available: false })
    seed()
    db.events.get("ev-a")!.endDate = new Date("2000-01-01T00:00:00Z")
    expect(await (await get("tok-r-me")).json()).toEqual({ available: false })
    seed()
    db.events.get("ev-a")!.personalDataAnonymizedAt = new Date()
    expect(await (await get("tok-r-me")).json()).toEqual({ available: false })
  })

  it("an erased volunteer or a known minor is never named, only counted like anyone else", async () => {
    const accueil = async () => (await (await get("tok-r-me")).json()).shifts.find((s: { shiftId: string }) => s.shiftId === "accueil")
    db.volunteers.get("aline")!.erasedAt = new Date()
    expect(await accueil()).toMatchObject({ names: [], othersCount: 1 })
    seed()
    db.volunteers.get("aline")!.birthDate = new Date("2090-01-01T00:00:00Z")
    expect(await accueil()).toMatchObject({ names: [], othersCount: 1 })
    expect(JSON.stringify(await (await get("tok-r-me")).json())).not.toContain("Aline")
  })

  it("an unknown or cancelled link is a 404, counted as a miss", async () => {
    expect((await get("nope")).status).toBe(404)
    db.registrations.find((r) => r.id === "r-me")!.status = "cancelled"
    expect((await get("tok-r-me")).status).toBe(404)
  })
})

describe("PATCH /api/public/registrations/[token]/roster (#1068)", () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })

  it("shows, then hides the holder's name, each change logged as theirs", async () => {
    let res = await patch("tok-r-me", { visible: true, noticeVersion: "2026-10-21.2" })
    expect(res.status).toBe(200)
    expect((await res.json()).state).toBe("visible")
    expect(db.consents.find((c) => c.volunteerId === "me")).toMatchObject({ eventId: "ev-a", status: "visible", source: "personal_page", noticeVersion: expect.any(String) })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "ev-a", actor: { type: "volunteer", id: "me" }, action: "roster.choice_changed", changes: { rosterName: { from: null, to: "visible" } } }))
    // Another volunteer now sees « Moi M. ».
    expect((await (await get("tok-r-bruno")).json()).shifts.find((s: { shiftId: string }) => s.shiftId === "bar")).toMatchObject({ names: ["Moi M."], othersCount: 1 })

    res = await patch("tok-r-me", { visible: false })
    expect((await res.json()).state).toBe("hidden")
    const bruno = await (await get("tok-r-bruno")).json()
    expect(JSON.stringify(bruno)).not.toContain("Moi")
    // Hidden again: counted like Chloé, the same number as a pending or absent choice.
    expect(bruno.shifts.find((s: { shiftId: string }) => s.shiftId === "bar")).toMatchObject({ names: [], othersCount: 2 })
  })

  it("confirms a pending request from the sign-up form", async () => {
    const res = await patch("tok-r-bruno", { visible: true, noticeVersion: "2026-10-21.2" })
    expect((await res.json()).state).toBe("visible")
    expect((await (await get("tok-r-me")).json()).shifts.find((s: { shiftId: string }) => s.shiftId === "bar")).toMatchObject({ names: ["Bruno K."], othersCount: 1 })
  })

  it("hiding is always possible, showing is refused when the roster is closed or for a known minor", async () => {
    db.events.get("ev-a")!.shiftRosterEnabled = false
    expect((await patch("tok-r-me", { visible: true })).status).toBe(409)
    expect((await patch("tok-r-me", { visible: false })).status).toBe(200)
    expect(db.consents.find((c) => c.volunteerId === "me")?.status).toBe("hidden")
    seed()
    db.volunteers.get("me")!.birthDate = new Date("2090-01-01T00:00:00Z")
    expect((await patch("tok-r-me", { visible: true })).status).toBe(409)
    expect(db.consents.find((c) => c.volunteerId === "me")).toBeUndefined()
  })

  it("a link of event A only writes the choice for event A", async () => {
    await patch("tok-r-bob", { visible: false })
    expect(db.consents.filter((c) => c.volunteerId === "bob")).toEqual([expect.objectContaining({ eventId: "ev-b", status: "hidden" })])
    expect(db.consents.filter((c) => c.eventId === "ev-a" && c.volunteerId === "bob")).toEqual([])
  })

  it("never writes onto an erased record, refuses a bad body or an unknown link", async () => {
    db.volunteers.get("me")!.erasedAt = new Date()
    expect((await patch("tok-r-me", { visible: false })).status).toBe(404)
    expect(db.consents.find((c) => c.volunteerId === "me")).toBeUndefined()
    expect((await patch("tok-r-me", { visible: "yes" })).status).toBe(400)
    expect((await patch("nope", { visible: false })).status).toBe(404)
  })
})

describe("the roster's text versions on a personal link (#1068 follow-up)", () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })

  it("a confirmed volunteer sees names given under the first text too; an unknown text is never shown", async () => {
    db.consents.find((c) => c.volunteerId === "aline")!.noticeVersion = "2026-10-21"
    expect((await (await get("tok-r-me")).json()).shifts[1].names).toEqual(["Aline M."])
    db.consents.find((c) => c.volunteerId === "aline")!.noticeVersion = "2099-01-01"
    const body = await (await get("tok-r-me")).json()
    expect(body.shifts[1]).toMatchObject({ names: [], othersCount: 1 })
  })

  it("a name shown under the first text: the page offers the current one, and showing again records it, logged as a wider audience", async () => {
    db.consents.push({ eventId: "ev-a", volunteerId: "me", status: "visible", noticeVersion: "2026-10-21" })
    expect((await (await get("tok-r-me")).json()).state).toBe("visible_confirmed")
    // A page loaded before the current text sends no version: the first text's audience is kept.
    expect((await (await patch("tok-r-me", { visible: true })).json()).state).toBe("visible_confirmed")
    expect(logEvent).not.toHaveBeenCalled()
    const res = await patch("tok-r-me", { visible: true, noticeVersion: "2026-10-21.2" })
    expect((await res.json()).state).toBe("visible")
    expect(db.consents.find((c) => c.volunteerId === "me")).toMatchObject({ status: "visible", noticeVersion: "2026-10-21.2", source: "personal_page" })
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "roster.choice_changed",
      changes: { rosterAudience: { from: "confirmed", to: "confirmed_and_invited" } },
    }))
    // Again: nothing to record.
    logEvent.mockClear()
    await patch("tok-r-me", { visible: true, noticeVersion: "2026-10-21.2" })
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("hiding a name shown under the first text hides it for everyone", async () => {
    db.consents.push({ eventId: "ev-a", volunteerId: "me", status: "visible", noticeVersion: "2026-10-21" })
    expect((await (await patch("tok-r-me", { visible: false })).json()).state).toBe("hidden")
    expect(db.consents.find((c) => c.volunteerId === "me")).toMatchObject({ status: "hidden" })
  })
})

describe("PATCH and the text the page showed (#1068 follow-up)", () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })
  it("a new acceptance from a page without the current text reaches confirmed volunteers only", async () => {
    await patch("tok-r-me", { visible: true })
    expect(db.consents.find((c) => c.volunteerId === "me")).toMatchObject({ status: "visible", noticeVersion: "2026-10-21" })
    await patch("tok-r-me", { visible: true, noticeVersion: "2099-01-01" })
    expect(db.consents.find((c) => c.volunteerId === "me")).toMatchObject({ noticeVersion: "2026-10-21" })
  })
})
