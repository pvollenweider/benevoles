import { describe, it, expect, vi, beforeEach } from "vitest"

// The « Secteur » filter on the exports and the « Jour J » board route (#1170): applied in the
// query, by poste, read at the request; nothing changes in an event without sectors.
const requireOrgSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-guard", () => ({ requireOrgSession: requireOrgSessionMock }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { GET as attendance } from "@/app/api/admin/events/[id]/export/attendance/route"
import { GET as answers } from "@/app/api/admin/events/[id]/export/answers/route"
import { GET as sheets } from "@/app/api/admin/events/[id]/export/sheets/[view]/route"
import { GET as badges } from "@/app/api/admin/events/[id]/export/badges/route"
import { GET as pdf } from "@/app/api/admin/events/[id]/export/pdf/route"
import { GET as dayOf } from "@/app/api/admin/events/[id]/day-of/route"

const PARK = { roleName: { in: ["Parking Nord"] } }
const sectors = [{ id: "sec-park", name: "Parking", displayOrder: 0, archivedAt: null }]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = any

/** A scoped db: the sector lookup answers `sectorEvent`, every other event read answers `data`. */
function setup(sectorEvent: unknown, data: Record<string, unknown> = {}) {
  const findFirst = vi.fn(async (args: Args) => {
    if (args?.select && "sectorsAdoptedAt" in args.select && !("title" in args.select) && !("id" in args.select)) return sectorEvent
    return {
      id: "evt-1", title: "Fête", slug: "fete", startDate: new Date("2026-07-04"), endDate: new Date("2026-07-04"), showSchedule: null,
      sectorsEnabled: true, sectorsAdoptedAt: null, sectors: [],
      organization: { name: "Org", timeZone: "Europe/Zurich", logo: null },
      questions: [], registrations: [], shifts: [], sectorLeaders: [],
      ...data,
    }
  })
  const findMany = vi.fn().mockResolvedValue([
    { roleName: "Parking Nord", sectorId: "sec-park", updatedAt: new Date("2026-10-02") },
    { roleName: "Bar", sectorId: null, updatedAt: new Date("2026-10-02") },
  ])
  requireOrgSessionMock.mockResolvedValue({ db: { event: { findFirst }, shift: { findMany } }, organizationId: "org-a" })
  return { findFirst, findMany, dataCall: (): Args => findFirst.mock.calls.map((c) => c[0] as Args).find((a: Args) => !("sectorsAdoptedAt" in (a.select ?? {})) || "title" in (a.select ?? {}) || "id" in (a.select ?? {})) }
}

const adopted = { sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-01"), sectors }
const req = (path: string) => new Request(`http://localhost${path}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

describe("exports with ?secteur= (#1170)", () => {
  it("attendance CSV: the sector's registrations only, and the file is named after it", async () => {
    const { dataCall } = setup(adopted)
    const res = await attendance(req("/api/admin/events/evt-1/export/attendance?secteur=sec-park"), params("evt-1"))
    expect(res.status).toBe(200)
    expect(dataCall()!.select.registrations.where).toEqual({ status: "active", shift: PARK })
    expect(res.headers.get("Content-Disposition")).toContain("presences-fete-secteur-parking.csv")
  })

  it("answers CSV: counts the people of the sector's postes only", async () => {
    const { dataCall } = setup(adopted)
    const res = await answers(req("/api/admin/events/evt-1/export/answers?secteur=autres"), params("evt-1"))
    expect(res.status).toBe(200)
    expect(dataCall()!.select.registrations.where.shift).toEqual({ status: { not: "cancelled" }, roleName: { in: ["Bar"] } })
    expect(res.headers.get("Content-Disposition")).toContain("reponses-fete-autres-postes.csv")
  })

  it("printed sheets: the sector's shifts, captioned under the title", async () => {
    const { dataCall } = setup(adopted)
    const res = await sheets(req("/api/admin/events/evt-1/export/sheets/day?secteur=sec-park"), { params: Promise.resolve({ id: "evt-1", view: "day" }) })
    expect(dataCall()!.select.shifts.where).toEqual({ status: { not: "cancelled" }, ...PARK })
    const html = await res.text()
    expect(html).toContain("<strong>Secteur : Parking</strong>")
    expect(html).toContain("<title>Planning par jour – Fête – Secteur : Parking</title>")
  })

  it("badges: the sector's shifts, captioned", async () => {
    const { dataCall } = setup(adopted)
    const res = await badges(req("/api/admin/events/evt-1/export/badges?secteur=sec-park&role=Parking%20Nord"), params("evt-1"))
    expect(dataCall()!.select.shifts.where).toEqual({ status: { not: "cancelled" }, ...PARK })
    expect(await res.text()).toContain("Secteur : Parking")
  })

  it("full export (PDF): the sector's shifts, captioned", async () => {
    const { dataCall } = setup(adopted)
    const res = await pdf(req("/api/admin/events/evt-1/export/pdf?secteur=sec-park"), params("evt-1"))
    expect(dataCall()!.include.shifts.where).toEqual({ status: { not: "cancelled" }, ...PARK })
    expect(await res.text()).toContain("<strong>Secteur : Parking</strong>")
  })

  it("« Jour J » board route: every poll keeps the sector", async () => {
    const { dataCall } = setup(adopted, { organization: { timeZone: "Europe/Zurich" } })
    const res = await dayOf(req("/api/admin/events/evt-1/day-of?secteur=sec-park"), params("evt-1"))
    expect(res.status).toBe(200)
    expect(dataCall()!.select.shifts.where).toMatchObject({ status: { not: "cancelled" }, ...PARK })
  })
})

describe("no change without a filter or without sectors (#1170)", () => {
  it("an event without sectors ignores ?secteur=: same query, no caption, no poste lookup", async () => {
    const { dataCall, findMany } = setup({ sectorsEnabled: false, sectorsAdoptedAt: null, sectors: [] })
    const res = await sheets(req("/api/admin/events/evt-1/export/sheets/day?secteur=sec-park"), { params: Promise.resolve({ id: "evt-1", view: "day" }) })
    expect(dataCall()!.select.shifts.where).toEqual({ status: { not: "cancelled" } })
    expect(await res.text()).not.toContain("Secteur :")
    expect(findMany).not.toHaveBeenCalled()
  })

  it("without the param, the routes read exactly as before (one event read)", async () => {
    const { findFirst, findMany } = setup(adopted)
    const res = await attendance(req("/api/admin/events/evt-1/export/attendance"), params("evt-1"))
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst.mock.calls[0][0].select.registrations.where).toEqual({ status: "active" })
    expect(findMany).not.toHaveBeenCalled()
    expect(res.headers.get("Content-Disposition")).toContain('presences-fete.csv"')
  })

  it("an unknown or archived sector reads as all sectors, never an error", async () => {
    const { dataCall } = setup({ ...adopted, sectors: [...sectors, { id: "sec-old", name: "Ancien", displayOrder: 1, archivedAt: new Date() }] })
    const res = await pdf(req("/api/admin/events/evt-1/export/pdf?secteur=sec-old"), params("evt-1"))
    expect(res.status).toBe(200)
    expect(dataCall()!.include.shifts.where).toEqual({ status: { not: "cancelled" } })
  })
})
