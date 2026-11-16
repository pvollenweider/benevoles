/**
 * Front-desk access limited to one event (#1142): the two routes a front-desk account reaches,
 * with the real guard (auth-guard, permissions, front-desk-access), the real org-scoped client
 * (prisma-org) and the real attendance writer, over an in-memory database. Only the session
 * provider, the Prisma client underneath and the sending functions are replaced.
 *
 * Bulk route: attendance actions only, on the granted event only, every id of that event or
 * nothing. Day-of route: the board of the granted event, without an email, an answer or a note.
 * Both: refused as soon as the grant is revoked, expired, for another event, in another
 * organisation, or its event archived.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const auth = vi.hoisted(() => vi.fn())
vi.mock("@/auth", () => ({ auth }))

type Row = Record<string, unknown>

const fake = vi.hoisted(() => {
  type R = Record<string, unknown>
  const store = {
    organizations: [] as R[], events: [] as R[], grants: [] as R[], admins: [] as R[], registrations: [] as R[],
    /** Every query that reached the database: "model.operation". */
    calls: [] as string[],
  }

  /** A small Prisma `where`: AND / OR / NOT, equality, null, `in`, `not`, and one level of relation. */
  function matches(row: R | null | undefined, where: unknown): boolean {
    if (!where) return true
    if (!row) return false
    return Object.entries(where as R).every(([key, cond]) => {
      if (key === "AND") return (Array.isArray(cond) ? cond : [cond]).every((w) => matches(row, w))
      if (key === "OR") return (cond as unknown[]).some((w) => matches(row, w))
      if (key === "NOT") return !matches(row, cond)
      const value = row[key]
      if (cond === null) return value === null || value === undefined
      if (typeof cond === "object" && !(cond instanceof Date)) {
        const c = cond as R
        if ("in" in c) return (c.in as unknown[]).includes(value)
        if ("not" in c) return c.not === null ? value !== null && value !== undefined : value !== c.not
        return typeof value === "object" && value !== null && matches(value as R, c)
      }
      return value === cond
    })
  }

  const event = (id: unknown) => store.events.find((e) => e.id === id) ?? null
  const eventView = (e: R) => ({ ...e, organization: store.organizations.find((o) => o.id === e.organizationId) })
  const registrationView = (r: R) => ({ ...r, event: event(r.eventId) })
  const grantView = (g: R) => ({ ...g, event: event(g.eventId), adminUser: store.admins.find((a) => a.id === g.adminUserId) ?? null })

  const raw: Record<string, Record<string, (args: { where?: unknown; data?: R }) => Promise<unknown>>> = {
    organization: {
      findUnique: async ({ where }) => store.organizations.find((o) => matches(o, where)) ?? null,
    },
    adminEventAccess: {
      findFirst: async ({ where }) => store.grants.map(grantView).find((g) => matches(g, where)) ?? null,
    },
    event: {
      findFirst: async ({ where }) => store.events.map(eventView).find((e) => matches(e, where)) ?? null,
    },
    shift: {
      findMany: async () => [],
    },
    registration: {
      findMany: async ({ where }) => store.registrations.map(registrationView).filter((r) => matches(r, where)),
      updateMany: async ({ where, data }) => {
        const hit = store.registrations.filter((r) => matches(registrationView(r), where))
        for (const r of hit) Object.assign(r, data)
        return { count: hit.length }
      },
      // The attendance writer reads the kept arrival from the same statement (#1141).
      updateManyAndReturn: async ({ where, data }) => {
        const hit = store.registrations.filter((r) => matches(registrationView(r), where))
        for (const r of hit) Object.assign(r, data)
        return hit.map((r) => ({ id: r.id, checkedInAt: r.checkedInAt }))
      },
    },
  }

  const delegate = (model: string, run: (op: string, args: unknown) => Promise<unknown>) => new Proxy({}, {
    get: (_t, op) => (args: unknown) => run(String(op), args),
  })
  const rawOp = (model: string, op: string, args: unknown) => {
    store.calls.push(`${model}.${op}`)
    const fn = raw[model]?.[op]
    if (!fn) throw new Error(`fake database: ${model}.${op} is not expected here`)
    return fn((args ?? {}) as { where?: unknown; data?: R })
  }

  type Hook = (input: { model: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown>
  const prisma = new Proxy({}, {
    get: (_t, name) => {
      // The real org-scoped extension (src/lib/prisma-org.ts) runs over the same rows.
      if (name === "$extends") {
        return (config: { query: { $allModels: { $allOperations: Hook } } }) => new Proxy({}, {
          get: (_c, model) => delegate(String(model), (op, args) => config.query.$allModels.$allOperations({
            model: String(model).charAt(0).toUpperCase() + String(model).slice(1),
            operation: op,
            args,
            query: (a) => rawOp(String(model), op, a),
          })),
        })
      }
      if (name === "then") return undefined
      return delegate(String(name), (op, args) => rawOp(String(name), op, args))
    },
  })
  return { store, prisma }
})
vi.mock("@/lib/prisma", () => ({ prisma: fake.prisma }))
vi.mock("@/lib/org-activity", () => ({ touchOrgActivity: vi.fn() }))

const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", async (original) => ({ ...(await original<typeof import("@/lib/event-log")>()), logEvent }))
const sent = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notifications", () => ({ sendNotification: sent }))
vi.mock("@/lib/notifications/outbox", () => ({ enqueueNotifications: sent, deliverAfterResponse: sent }))
vi.mock("@/lib/waitlist", () => ({ promoteNextInWaitlist: vi.fn() }))
vi.mock("@/lib/sector-leaders", () => ({ tagVolunteerAsResponsable: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

import { FRONT_DESK_BULK_ACTIONS } from "@/lib/permissions"

const ORG = "org-fete"
const OTHER_ORG = "org-tournoi"
const EVENT = "evt-fete-2027"
const OTHER_EVENT = "evt-marche-2027"
const FOREIGN_EVENT = "evt-tournoi-2027"

// Colette Favre: front-desk account of the organisation, granted on one event.
const colette = { user: { id: "adm-colette", name: "Colette Favre", email: "colette.favre@example.org", role: "front_desk", organizationId: ORG } }
// Sami Haddad: organiser of the same organisation.
const sami = { user: { id: "adm-sami", name: "Sami Haddad", email: "sami.haddad@example.org", role: "organizer", organizationId: ORG } }

const today = new Date().toISOString().slice(0, 10)

function seed() {
  const s = fake.store
  s.calls.length = 0
  s.organizations = [
    { id: ORG, active: true, slug: "fete", timeZone: "Europe/Zurich" },
    { id: OTHER_ORG, active: true, slug: "tournoi", timeZone: "Europe/Zurich" },
  ]
  const shift = (id: string, registrations: Row[]) => ({
    id, roleName: "Accueil", label: null, date: new Date(`${today}T00:00:00.000Z`), startTime: "00:00", endTime: "23:59", capacity: 4, displayOrder: 0,
    contactName: "Sami Haddad", contactPhone: "+41 79 555 01 01", registrations,
  })
  // What the loader's nested read would return, with fields it must never pass on.
  const person = (id: string, firstName: string, lastName: string) => ({
    id, phone: null, checkedInAt: null, attendanceStatus: null,
    comment: "Allergie aux arachides", adminNote: "À surveiller", answers: [{ value: "Végétarien" }],
    volunteer: { firstName, lastName, phone: "+41 79 555 02 02", email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.org`, notes: "Note interne" },
  })
  const baseEvent = { title: "Fête du village", startDate: new Date(`${today}T00:00:00.000Z`), endDate: new Date(`${today}T00:00:00.000Z`), publicStatus: "published", registrationsOpen: true, registrationOpensAt: null, registrationClosesAt: null, sectorsEnabled: false, sectorsAdoptedAt: null, sectors: [] }
  s.events = [
    { ...baseEvent, id: EVENT, organizationId: ORG, shifts: [shift("shift-accueil", [person("reg-nadia", "Nadia", "Rochat"), person("reg-luc", "Luc", "Berset")])] },
    { ...baseEvent, id: OTHER_EVENT, title: "Marché de Noël", organizationId: ORG, shifts: [shift("shift-marche", [person("reg-ines", "Inès", "Morel")])] },
    { ...baseEvent, id: FOREIGN_EVENT, title: "Tournoi", organizationId: OTHER_ORG, shifts: [shift("shift-tournoi", [person("reg-paulo", "Paulo", "Ferreira")])] },
  ]
  const registration = (id: string, eventId: string, shiftId: string) => ({
    id, eventId, shiftId, status: "active", checkedInAt: null, attendanceStatus: null, attendanceAt: null, attendanceBy: null,
    volunteer: { id: `vol-${id}`, firstName: "Nadia", lastName: "Rochat", email: "nadia.rochat@example.org" }, shift: { roleName: "Accueil" },
  })
  s.registrations = [
    registration("reg-nadia", EVENT, "shift-accueil"),
    registration("reg-luc", EVENT, "shift-accueil"),
    registration("reg-ines", OTHER_EVENT, "shift-marche"),
    registration("reg-paulo", FOREIGN_EVENT, "shift-tournoi"),
  ]
  s.admins = [
    { id: "adm-colette", organizationId: ORG, isActive: true, role: "front_desk" },
    { id: "adm-sami", organizationId: ORG, isActive: true, role: "organizer" },
  ]
  s.grants = [{ id: "grant-1", adminUserId: "adm-colette", eventId: EVENT, organizationId: ORG, createdById: "adm-sami", createdAt: new Date("2027-01-01T08:00:00Z"), expiresAt: null, revokedAt: null }]
}

const grant = () => fake.store.grants[0]
const registrationRow = (id: string) => fake.store.registrations.find((r) => r.id === id)!
const calls = () => fake.store.calls
/** Queries on anything but the organisation's state and the grant: the route's own work. */
const businessCalls = () => calls().filter((c) => c !== "organization.findUnique" && c !== "adminEventAccess.findFirst")

async function bulk(eventId: string, body: unknown) {
  const { POST } = await import("@/app/api/admin/events/[id]/registrations/bulk/route")
  const res = await POST(
    new Request(`http://localhost/api/admin/events/${eventId}/registrations/bulk`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: eventId }) },
  )
  return { status: res.status, json: await res.json() }
}

async function dayOf(eventId: string, query = "") {
  const { GET } = await import("@/app/api/admin/events/[id]/day-of/route")
  const res = await GET(new Request(`http://localhost/api/admin/events/${eventId}/day-of${query}`), { params: Promise.resolve({ id: eventId }) })
  return { status: res.status, json: await res.json(), cache: res.headers.get("Cache-Control") }
}

/** The ways a grant stops counting. Each returns the event to ask for. */
const DEAD_GRANTS: [string, () => string][] = [
  ["a revoked grant", () => { grant().revokedAt = new Date(Date.now() - 60_000); return EVENT }],
  ["an expired grant", () => { grant().expiresAt = new Date(Date.now() - 1000); return EVENT }],
  ["a grant for another event of the same organisation", () => OTHER_EVENT],
  ["a grant in another organisation", () => { Object.assign(grant(), { organizationId: OTHER_ORG, eventId: FOREIGN_EVENT }); return FOREIGN_EVENT }],
  ["a grant of this organisation pointing to another organisation's event", () => { grant().eventId = FOREIGN_EVENT; return FOREIGN_EVENT }],
  ["an archived event", () => { fake.store.events.find((e) => e.id === EVENT)!.publicStatus = "archived"; return EVENT }],
  ["no grant at all", () => { fake.store.grants.length = 0; return EVENT }],
  ["an account that is no longer an active front-desk account", () => { fake.store.admins.find((a) => a.id === "adm-colette")!.isActive = false; return EVENT }],
  ["a deactivated organisation", () => { fake.store.organizations.find((o) => o.id === ORG)!.active = false; return EVENT }],
]

beforeEach(() => {
  vi.clearAllMocks()
  seed()
  auth.mockResolvedValue(colette)
})

describe("POST registrations/bulk as a front-desk account (#1142)", () => {
  it.each(["cancel", "make_leader", "resend_link"])("refuses « %s » with 403 before the event or any registration is read", async (action) => {
    const res = await bulk(EVENT, { action, registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ error: "Accès refusé" })
    expect(businessCalls()).toEqual([])
    expect(registrationRow("reg-nadia")).toMatchObject({ status: "active", checkedInAt: null, attendanceStatus: null })
    expect(logEvent).not.toHaveBeenCalled()
    expect(sent).not.toHaveBeenCalled()
  })

  it("an action that does not exist is refused as invalid, nothing read", async () => {
    const res = await bulk(EVENT, { action: "left_early", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(400)
    expect(businessCalls()).toEqual([])
  })

  it("accepts the six attendance actions with a live grant, and logs the front-desk account as the author", async () => {
    expect([...FRONT_DESK_BULK_ACTIONS]).toEqual(["check_in", "undo_check_in", "mark_absent", "undo_absent", "mark_left_early", "undo_left_early"])

    let res = await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ done: 1, changedIds: ["reg-nadia"] })
    expect(registrationRow("reg-nadia").checkedInAt).toBeInstanceOf(Date)
    expect(logEvent).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: EVENT, action: "registration.checked_in", entityId: "reg-nadia", actor: expect.objectContaining({ type: "admin", id: "adm-colette" }) }))

    res = await bulk(EVENT, { action: "undo_check_in", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ done: 1 })
    expect(registrationRow("reg-nadia").checkedInAt).toBeNull()

    res = await bulk(EVENT, { action: "mark_absent", registrationIds: ["reg-luc"] })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ done: 1, changedIds: ["reg-luc"] })
    expect(registrationRow("reg-luc")).toMatchObject({ attendanceStatus: "absent", attendanceBy: "adm-colette" })

    res = await bulk(EVENT, { action: "undo_absent", registrationIds: ["reg-luc"] })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ done: 1 })
    expect(registrationRow("reg-luc").attendanceStatus).toBeNull()

    // A departure: the arrival is recorded first, kept by the departure, restored by its undo.
    res = await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(200)
    const arrival = registrationRow("reg-nadia").checkedInAt
    res = await bulk(EVENT, { action: "mark_left_early", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ done: 1, changedIds: ["reg-nadia"] })
    expect(registrationRow("reg-nadia")).toMatchObject({ checkedInAt: arrival, attendanceStatus: "left_early", attendanceBy: "adm-colette" })
    expect(logEvent).toHaveBeenLastCalledWith(expect.objectContaining({ action: "registration.marked_left_early", entityId: "reg-nadia" }))

    res = await bulk(EVENT, { action: "undo_left_early", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ done: 1 })
    expect(registrationRow("reg-nadia")).toMatchObject({ checkedInAt: arrival, attendanceStatus: null, attendanceAt: null, attendanceBy: null })
    expect(logEvent).toHaveBeenLastCalledWith(expect.objectContaining({ action: "registration.departure_undone", entityId: "reg-nadia" }))

    expect(logEvent).toHaveBeenCalledTimes(7)
    expect(sent).not.toHaveBeenCalled()
  })

  it.each(DEAD_GRANTS)("refuses a check-in with %s: 403, nothing read or written", async (_label, arrange) => {
    const eventId = arrange()
    const ids = fake.store.registrations.filter((r) => r.eventId === eventId).map((r) => r.id as string)
    const res = await bulk(eventId, { action: "check_in", registrationIds: ids })
    expect(res.status).toBe(403)
    expect(businessCalls()).toEqual([])
    for (const r of fake.store.registrations) expect(r.checkedInAt).toBeNull()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("the grant is read again on every request: revoked between two taps, the second is refused", async () => {
    expect((await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })).status).toBe(200)
    grant().revokedAt = new Date()
    expect((await bulk(EVENT, { action: "check_in", registrationIds: ["reg-luc"] })).status).toBe(403)
    expect(registrationRow("reg-luc").checkedInAt).toBeNull()
  })

  it("an expiry in the future still counts; the instant itself does not", async () => {
    grant().expiresAt = new Date(Date.now() + 60_000)
    expect((await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })).status).toBe(200)
  })

  it.each([
    ["a registration of another event of the same organisation", "reg-ines"],
    ["a registration of another organisation", "reg-paulo"],
    ["an unknown registration", "reg-inconnue"],
  ])("mixed ids with %s: refused as a whole, nothing written", async (_label, foreign) => {
    const res = await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia", foreign] })
    expect(res.status).toBe(404)
    expect(calls()).not.toContain("registration.updateManyAndReturn")
    for (const r of fake.store.registrations) expect(r.checkedInAt).toBeNull()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("the same holds for the absence actions", async () => {
    const res = await bulk(EVENT, { action: "mark_absent", registrationIds: ["reg-luc", "reg-ines"] })
    expect(res.status).toBe(404)
    for (const r of fake.store.registrations) expect(r.attendanceStatus).toBeNull()
  })

  it("the event of the path decides: the granted event's ids sent to another event's address are refused", async () => {
    const res = await bulk(OTHER_EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(403)
    expect(businessCalls()).toEqual([])
  })

  it("an organiser keeps every action, on any event of the organisation, without a grant being read", async () => {
    auth.mockResolvedValue(sami)
    const res = await bulk(OTHER_EVENT, { action: "check_in", registrationIds: ["reg-ines"] })
    expect(res.status).toBe(200)
    expect(registrationRow("reg-ines").checkedInAt).toBeInstanceOf(Date)
    expect(calls()).not.toContain("adminEventAccess.findFirst")
    // A non-attendance action is not refused for the role (no active row here: nothing is sent).
    for (const r of fake.store.registrations) r.status = "cancelled"
    const resend = await bulk(EVENT, { action: "resend_link", registrationIds: ["reg-nadia"] })
    expect(resend.status).toBe(200)
    expect(resend.json).toMatchObject({ done: 0, skipped: 1 })
  })

  it("an organiser of another organisation gets 404 for this event, as before", async () => {
    auth.mockResolvedValue({ user: { id: "adm-paul", name: "Paul Girard", email: "paul.girard@example.org", role: "organizer", organizationId: OTHER_ORG } })
    const res = await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })
    expect(res.status).toBe(404)
    expect(registrationRow("reg-nadia").checkedInAt).toBeNull()
  })

  it("a signed-out caller gets 401", async () => {
    auth.mockResolvedValue(null)
    expect((await bulk(EVENT, { action: "check_in", registrationIds: ["reg-nadia"] })).status).toBe(401)
    expect(calls()).toEqual([])
  })
})

/** Every key of a JSON value, at any depth. */
function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, out)
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { out.add(k); keysOf(v, out) }
  return out
}

describe("GET day-of as a front-desk account (#1142)", () => {
  it("returns the board of the granted event, uncached", async () => {
    const res = await dayOf(EVENT)
    expect(res.status).toBe(200)
    expect(res.cache).toBe("no-store")
    expect(Object.keys(res.json).sort()).toEqual(["board", "refreshedAt", "today"])
    // The people of the event are there (names, for the check-in)…
    const text = JSON.stringify(res.json)
    expect(text).toContain("Rochat")
    expect(text).toContain("Berset")
    // …and nobody of another event or organisation.
    expect(text).not.toContain("Morel")
    expect(text).not.toContain("Ferreira")
  })

  it("carries no email, answer or note: neither as a key nor as a value", async () => {
    const res = await dayOf(EVENT)
    expect(res.status).toBe(200)
    const keys = [...keysOf(res.json)]
    expect(keys.length).toBeGreaterThan(5)
    expect(keys.filter((k) => /e-?mail|answer|note|comment|token|birth|address/i.test(k))).toEqual([])
    const text = JSON.stringify(res.json)
    for (const secret of ["@example.org", "Allergie", "À surveiller", "Végétarien", "Note interne"]) expect(text).not.toContain(secret)
  })

  it.each(DEAD_GRANTS)("refuses with %s: 403, nothing read", async (_label, arrange) => {
    const eventId = arrange()
    const res = await dayOf(eventId)
    expect(res.status).toBe(403)
    expect(res.json).toEqual({ error: "Accès refusé" })
    expect(businessCalls()).toEqual([])
  })

  it("the « secteur » filter changes nothing to the check", async () => {
    expect((await dayOf(EVENT, "?secteur=s1")).status).toBe(200)
    expect((await dayOf(OTHER_EVENT, "?secteur=s1")).status).toBe(403)
  })

  it("an organiser reads any event of the organisation, and not another organisation's", async () => {
    auth.mockResolvedValue(sami)
    expect((await dayOf(OTHER_EVENT)).status).toBe(200)
    expect((await dayOf(FOREIGN_EVENT)).status).toBe(404)
    expect(calls()).not.toContain("adminEventAccess.findFirst")
  })

  it("a signed-out caller gets 401", async () => {
    auth.mockResolvedValue(null)
    expect((await dayOf(EVENT)).status).toBe(401)
    expect(calls()).toEqual([])
  })
})
