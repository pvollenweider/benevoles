import { describe, it, expect, vi } from "vitest"
import { UNFILTERED, loadSectorFilter, sectorFilterOfRequest } from "../sector-filter-data"
import type { OrgScopedPrisma } from "../prisma-org"

const sectors = [
  { id: "sec-park", name: "Parking", displayOrder: 0, archivedAt: null },
  { id: "sec-old", name: "Ancien", displayOrder: 1, archivedAt: new Date("2026-10-10") },
]
const at = (iso: string) => new Date(iso)

function db(event: unknown, shifts: unknown[] = []) {
  const findFirst = vi.fn().mockResolvedValue(event)
  const findMany = vi.fn().mockResolvedValue(shifts)
  return { db: { event: { findFirst }, shift: { findMany } } as unknown as OrgScopedPrisma, findFirst, findMany }
}

describe("loadSectorFilter (#1170)", () => {
  it("is null for an event that is not the organisation's", async () => {
    const { db: d, findMany } = db(null)
    expect(await loadSectorFilter(d, "evt-b", "sec-park")).toBeNull()
    expect(findMany).not.toHaveBeenCalled()
  })

  it("offers nothing and narrows nothing without sectors adopted", async () => {
    const { db: d, findMany } = db({ sectorsEnabled: true, sectorsAdoptedAt: null, sectors })
    expect(await loadSectorFilter(d, "evt-1", "sec-park")).toEqual(UNFILTERED)
    expect(findMany).not.toHaveBeenCalled()
  })

  it("offers the choices and narrows nothing for all sectors", async () => {
    const { db: d, findMany } = db({ sectorsEnabled: true, sectorsAdoptedAt: at("2026-10-01"), sectors })
    const state = await loadSectorFilter(d, "evt-1", undefined)
    expect(state).toMatchObject({ offered: true, filter: { kind: "all" }, postes: null, shiftWhere: {}, registrationWhere: {} })
    expect(state!.options.map((o) => o.value)).toEqual(["", "sec-park", "autres"])
    expect(findMany).not.toHaveBeenCalled()
  })

  it("resolves the sector's postes from the live shifts now, by poste (majority rule)", async () => {
    const { db: d, findMany } = db({ sectorsEnabled: true, sectorsAdoptedAt: at("2026-10-01"), sectors }, [
      { roleName: "Parking Nord", sectorId: "sec-park", updatedAt: at("2026-10-02") },
      { roleName: "Parking Nord", sectorId: "sec-park", updatedAt: at("2026-10-02") },
      { roleName: "Bar", sectorId: null, updatedAt: at("2026-10-02") },
      { roleName: "Vestiaire", sectorId: "sec-old", updatedAt: at("2026-10-02") },
    ])
    const park = await loadSectorFilter(d, "evt-1", "sec-park")
    expect(findMany).toHaveBeenCalledWith({ where: { eventId: "evt-1", status: { not: "cancelled" } }, select: { roleName: true, sectorId: true, updatedAt: true } })
    expect(park).toMatchObject({ filter: { kind: "sector", id: "sec-park", name: "Parking" }, postes: ["Parking Nord"], shiftWhere: { roleName: { in: ["Parking Nord"] } }, registrationWhere: { shift: { roleName: { in: ["Parking Nord"] } } } })
    const others = await loadSectorFilter(d, "evt-1", "autres")
    expect(others!.postes).toEqual(["Bar", "Vestiaire"])
  })

  it("ignores a sector id of another event or organisation: it is not among the event's sectors", async () => {
    const { db: d, findMany } = db({ sectorsEnabled: true, sectorsAdoptedAt: at("2026-10-01"), sectors })
    expect(await loadSectorFilter(d, "evt-1", "sec-of-org-b")).toMatchObject({ offered: true, filter: { kind: "all" }, shiftWhere: {} })
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe("sectorFilterOfRequest", () => {
  it("reads nothing more without a secteur param", async () => {
    const { db: d, findFirst } = db({ sectorsEnabled: true, sectorsAdoptedAt: at("2026-10-01"), sectors })
    expect(await sectorFilterOfRequest(d, "evt-1", new Request("http://x/api?q=1"))).toEqual(UNFILTERED)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("reads the filter of the request otherwise", async () => {
    const { db: d } = db({ sectorsEnabled: true, sectorsAdoptedAt: at("2026-10-01"), sectors }, [{ roleName: "Parking Nord", sectorId: "sec-park", updatedAt: at("2026-10-02") }])
    expect((await sectorFilterOfRequest(d, "evt-1", new Request("http://x/api?secteur=sec-park")))!.postes).toEqual(["Parking Nord"])
  })
})
