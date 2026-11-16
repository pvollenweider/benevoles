import { describe, it, expect, vi, beforeEach } from "vitest"

// Sector first, then poste (#1147): POST /api/admin/shifts with a `sectorId` creates a new poste in
// that sector with its first shift. The sector is checked under the event and sector row locks
// (an active sector of this event, which adopted sectors); an existing poste keeps its sector and
// a different one is refused (409). Without `sectorId`, nothing changes.

const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
const logEvent = vi.hoisted(() => vi.fn().mockResolvedValue("log-1"))
vi.mock("@/lib/event-log", () => ({ logEvent, adminActor: () => ({ type: "admin", id: "adm-1" }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/beta-access", () => ({ canAdoptBeta: vi.fn() }))

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

const ADOPTED = { id: "evt-a", sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-06-01") }
const ENTREES = { id: "sec-entrees", name: "Entrées", archivedAt: null }

const tx = {
  $queryRaw: vi.fn(),
  shift: { findMany: vi.fn(), create: vi.fn() },
  sector: { findFirst: vi.fn() },
}
const db = {
  event: { findFirst: vi.fn() },
  shift: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
}

/** The row locks answer: the event, then the sector (when one is asked). */
function locks(event: unknown, sector?: unknown) {
  tx.$queryRaw.mockResolvedValueOnce(event ? [event] : [])
  if (sector !== undefined) tx.$queryRaw.mockResolvedValueOnce(sector ? [sector] : [])
}

const body = { eventId: "evt-a", roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2, displayOrder: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  db.event.findFirst.mockResolvedValue({ id: "evt-a", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-31") })
  db.shift.findMany.mockResolvedValue([])
  db.shift.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", ...data }))
  tx.shift.findMany.mockResolvedValue([])
  tx.shift.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "new", ...data }))
  tx.sector.findFirst.mockResolvedValue(null)
  requireOrgSessionMock.mockResolvedValue({ db, organizationId: "org-a", session: {} })
})

async function post(extra: object) {
  const { POST } = await import("@/app/api/admin/shifts/route")
  return POST(request({ ...body, ...extra }))
}

describe("POST /api/admin/shifts with a sector (#1147)", () => {
  it("creates a new poste in the chosen sector, under the event then sector locks, and logs it", async () => {
    locks(ADOPTED, ENTREES)
    const res = await post({ sectorId: "sec-entrees" })
    expect(res.status).toBe(201)
    expect(tx.shift.create.mock.calls[0][0].data).toMatchObject({ roleName: "Accueil", sectorId: "sec-entrees", status: "open" })
    const [eventLock, sectorLock] = tx.$queryRaw.mock.calls
    expect(eventLock.slice(1)).toEqual(["evt-a", "org-a"])
    expect(sectorLock.slice(1)).toEqual(["sec-entrees", "evt-a"])
    expect(db.shift.create).not.toHaveBeenCalled()
    expect(logEvent.mock.calls[0][0].changes.sector).toEqual({ from: null, to: "Entrées" })
  })

  it("creates a new poste in « Autres postes » with null, locking no sector", async () => {
    locks(ADOPTED)
    const res = await post({ sectorId: null })
    expect(res.status).toBe(201)
    expect(tx.shift.create.mock.calls[0][0].data.sectorId).toBeNull()
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
    expect(logEvent.mock.calls[0][0].changes).not.toHaveProperty("sector")
  })

  it("adds a shift to an existing poste of the same sector with the poste's settings", async () => {
    locks(ADOPTED, ENTREES)
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees", colorKey: "teal", displayOrder: 300, reservedTags: [] }])
    const res = await post({ sectorId: "sec-entrees" })
    expect(res.status).toBe(201)
    expect(tx.shift.create.mock.calls[0][0].data).toMatchObject({ sectorId: "sec-entrees", colorKey: "teal", displayOrder: 300 })
  })

  it("refuses (409) a sector that disagrees with the existing poste, any spelling, and writes nothing", async () => {
    locks(ADOPTED, { id: "sec-bar", name: "Bar", archivedAt: null })
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees" }])
    tx.sector.findFirst.mockResolvedValue({ name: "Entrées" })
    const res = await post({ roleName: " accueil ", sectorId: "sec-bar" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Le poste « Accueil » est dans le secteur « Entrées » : choisissez ce secteur, ou un autre nom pour créer un nouveau poste.")
    expect(tx.sector.findFirst.mock.calls[0][0].where).toEqual({ id: "sec-entrees", eventId: "evt-a" })
    expect(tx.shift.create).not.toHaveBeenCalled()
  })

  it("refuses (409) « Autres postes » for a poste that is in a sector", async () => {
    locks(ADOPTED)
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees" }])
    tx.sector.findFirst.mockResolvedValue({ name: "Entrées" })
    expect((await post({ sectorId: null })).status).toBe(409)
    expect(tx.shift.create).not.toHaveBeenCalled()
  })

  it("refuses (409) a sector for a poste that is in « Autres postes »", async () => {
    locks(ADOPTED, ENTREES)
    tx.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: null }])
    const res = await post({ sectorId: "sec-entrees" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("est dans « Autres postes »")
    expect(tx.shift.create).not.toHaveBeenCalled()
  })

  it("refuses an archived sector (409)", async () => {
    locks(ADOPTED, { ...ENTREES, archivedAt: new Date() })
    const res = await post({ sectorId: "sec-entrees" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("Ce secteur est archivé : rétablissez-le avant d'y placer un poste.")
    expect(tx.shift.create).not.toHaveBeenCalled()
  })

  it("refuses another event's sector, another organisation's included (404): the sector lock filters on the event", async () => {
    locks(ADOPTED, null)
    const res = await post({ sectorId: "sec-org-b" })
    expect(res.status).toBe(404)
    expect(tx.$queryRaw.mock.calls[1].slice(1)).toEqual(["sec-org-b", "evt-a"])
    expect(tx.shift.create).not.toHaveBeenCalled()
  })

  it("refuses a sector for an event that has not adopted sectors (409)", async () => {
    locks({ ...ADOPTED, sectorsAdoptedAt: null })
    expect((await post({ sectorId: "sec-entrees" })).status).toBe(409)
    expect(tx.shift.create).not.toHaveBeenCalled()
  })

  it("returns 404 for another organisation's event before any lock", async () => {
    db.event.findFirst.mockResolvedValue(null)
    expect((await post({ eventId: "evt-b", sectorId: "sec-entrees" })).status).toBe(404)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("without a sector, keeps the route as before: no lock, the poste's own sector", async () => {
    db.shift.findMany.mockResolvedValue([{ roleName: "Accueil", sectorId: "sec-entrees" }])
    expect((await post({})).status).toBe(201)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.shift.create.mock.calls[0][0].data.sectorId).toBe("sec-entrees")
  })
})
