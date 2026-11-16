import { describe, it, expect, vi, beforeEach } from "vitest"

// Sector first, then poste (#1147), for the bulk forms: « Créer une série » (POST
// /api/admin/shifts/series) and « Répéter chaque semaine » (POST /api/admin/shifts/recurrence)
// accept the form's `sectorId` with the same checks as one shift (newShiftsSector): the event and
// sector row locks, an active sector of this event which adopted sectors, an existing poste keeping
// its sector (409 for another), and every shift written in the same transaction. A permanence
// creates all its dates with the rule: no later generation needs a sector stored on the rule.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/beta-access", () => ({ canAdoptBeta: vi.fn() }))

const ADOPTED = { id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-06-01") }
const ENTREES = { id: "sec-entrees", name: "Entrées", archivedAt: null }

const tx = {
  $queryRaw: vi.fn(),
  shift: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
  shiftRecurrence: { create: vi.fn() },
  sector: { findFirst: vi.fn() },
}
const db = {
  event: { findFirst: vi.fn() },
  shift: { findMany: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}

/** The row locks answer: the event, then the sector (when one is asked). */
function locks(event: unknown, sector?: unknown) {
  tx.$queryRaw.mockResolvedValueOnce(event ? [event] : [])
  if (sector !== undefined) tx.$queryRaw.mockResolvedValueOnce(sector ? [sector] : [])
}

const series = { eventId: "evt-a", roleName: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "14:00", slotMinutes: 120, capacity: 2 }
const weekly = {
  eventId: "evt-a", roleName: "Accueil", from: "2026-07-01", until: "2026-07-31", weekdays: [3], everyWeeks: 1,
  startTime: "14:00", endTime: "17:00", slotMinutes: 180, capacity: 2, holidays: "none", closures: [],
}
const request = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

async function postSeries(extra: object) {
  const { POST } = await import("@/app/api/admin/shifts/series/route")
  return POST(request("/api/admin/shifts/series", { ...series, ...extra }))
}
async function postWeekly(extra: object) {
  const { POST } = await import("@/app/api/admin/shifts/recurrence/route")
  return POST(request("/api/admin/shifts/recurrence", { ...weekly, ...extra }))
}

/** The shift rows written: one create per slot (series) or one createMany (permanence). */
const seriesRows = () => tx.shift.create.mock.calls.map((c) => c[0].data)
const weeklyRows = () => (tx.shift.createMany.mock.calls[0]?.[0].data ?? []) as Record<string, unknown>[]

beforeEach(() => {
  vi.clearAllMocks()
  db.event.findFirst.mockResolvedValue({ id: "evt-a", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31") })
  db.shift.findMany.mockResolvedValue([])
  tx.shift.findMany.mockResolvedValue([])
  tx.shift.create.mockImplementation(async ({ data }: { data: object }) => ({ id: `new-${tx.shift.create.mock.calls.length}`, ...data, date: new Date("2026-07-04") }))
  tx.shift.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
  tx.shiftRecurrence.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "rule-1", ...data }))
  tx.sector.findFirst.mockResolvedValue(null)
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
})

describe.each([
  { name: "series", post: postSeries, rows: seriesRows },
  { name: "weekly permanence", post: postWeekly, rows: weeklyRows },
])("POST bulk shifts with a sector (#1147): $name", ({ post, rows }) => {
  it("creates a new poste in the chosen sector, under the event then sector locks, and logs it", async () => {
    locks(ADOPTED, ENTREES)
    const res = await post({ sectorId: "sec-entrees" })
    expect(res.status).toBe(201)
    expect(rows().length).toBeGreaterThan(0)
    expect(rows().every((r) => r.sectorId === "sec-entrees" && r.roleName === "Accueil")).toBe(true)
    const [eventLock, sectorLock] = tx.$queryRaw.mock.calls
    expect(eventLock.slice(1)).toEqual(["evt-a", "org-a"])
    expect(sectorLock.slice(1)).toEqual(["sec-entrees", "evt-a"])
    expect(logEvent.mock.calls[0][0].changes.sector).toEqual({ from: null, to: "Entrées" })
  })

  it("creates a new poste in « Autres postes » with null, locking no sector", async () => {
    locks(ADOPTED)
    expect((await post({ sectorId: null })).status).toBe(201)
    expect(rows().every((r) => r.sectorId === null)).toBe(true)
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(logEvent.mock.calls[0][0].changes).not.toHaveProperty("sector")
  })

  it("adds the shifts to an existing poste of the same sector with the poste's settings", async () => {
    locks(ADOPTED, ENTREES)
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees", colorKey: "teal", displayOrder: 300, reservedTags: [] }])
    expect((await post({ sectorId: "sec-entrees" })).status).toBe(201)
    expect(rows()[0]).toMatchObject({ sectorId: "sec-entrees", colorKey: "teal", displayOrder: 300 })
  })

  it("refuses (409) a sector that disagrees with the existing poste, any spelling, and writes nothing", async () => {
    locks(ADOPTED, { id: "sec-bar", name: "Bar", archivedAt: null })
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees" }])
    tx.sector.findFirst.mockResolvedValue({ name: "Entrées" })
    const res = await post({ roleName: "accueil", sectorId: "sec-bar" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Le poste « Accueil » est dans le secteur « Entrées » : choisissez ce secteur, ou un autre nom pour créer un nouveau poste.")
    expect(tx.sector.findFirst.mock.calls[0][0].where).toEqual({ id: "sec-entrees", eventId: "evt-a" })
    expect(rows()).toEqual([])
    expect(tx.shiftRecurrence.create).not.toHaveBeenCalled()
    expect(logEvent).not.toHaveBeenCalled()
  })

  it("refuses (409) « Autres postes » for a poste that is in a sector", async () => {
    locks(ADOPTED)
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees" }])
    expect((await post({ sectorId: null })).status).toBe(409)
    expect(rows()).toEqual([])
  })

  it("refuses an archived sector (409)", async () => {
    locks(ADOPTED, { ...ENTREES, archivedAt: new Date() })
    const res = await post({ sectorId: "sec-entrees" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Ce secteur est archivé : rétablissez-le avant d'y placer un poste.")
    expect(rows()).toEqual([])
    expect(tx.shiftRecurrence.create).not.toHaveBeenCalled()
  })

  it("refuses another event's sector (404): the sector lock filters on the event", async () => {
    locks(ADOPTED, null)
    expect((await post({ sectorId: "sec-other" })).status).toBe(404)
    expect(tx.$queryRaw.mock.calls[1].slice(1)).toEqual(["sec-other", "evt-a"])
    expect(rows()).toEqual([])
  })

  it("refuses a sector for an event that has not adopted sectors (409)", async () => {
    locks({ ...ADOPTED, sectorsAdoptedAt: null })
    expect((await post({ sectorId: "sec-entrees" })).status).toBe(409)
    expect(rows()).toEqual([])
  })

  it("without a sector, keeps the route as before: no lock, the poste's own sector", async () => {
    db.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees" }])
    expect((await post({})).status).toBe(201)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    expect(rows().every((r) => r.sectorId === "sec-entrees")).toBe(true)
  })
})

describe("POST /api/admin/shifts/recurrence with a sector (#1147)", () => {
  it("stores no sector on the rule: its dates are all created now, each with the poste's sector", async () => {
    locks(ADOPTED, ENTREES)
    expect((await postWeekly({ sectorId: "sec-entrees" })).status).toBe(201)
    expect(tx.shiftRecurrence.create.mock.calls[0][0].data).not.toHaveProperty("sectorId")
    // The Wednesdays of July 2026.
    expect(weeklyRows().map((r) => (r.date as Date).toISOString().slice(0, 10))).toEqual(["2026-07-01", "2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"])
    expect(weeklyRows().every((r) => r.recurrenceId === "rule-1")).toBe(true)
  })
})
