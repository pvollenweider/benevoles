import { describe, it, expect, vi } from "vitest"
import { loadRecentCancellations } from "../recent-cancellations-data"
import type { OrgScopedPrisma } from "../prisma-org"

describe("loadRecentCancellations with the « Secteur » filter (#1170)", () => {
  it("reads the cancellations of the sector's postes only", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const db = { registration: { findMany } } as unknown as OrgScopedPrisma
    await loadRecentCancellations(db, "evt-1", "Europe/Zurich", new Date("2026-07-04T12:00:00Z"), { roleName: { in: ["Parking Nord"] } })
    expect(findMany.mock.calls[0][0].where).toEqual({
      eventId: "evt-1", status: "cancelled",
      shift: { status: { not: "cancelled" }, date: { gte: new Date("2026-07-03T00:00:00Z") }, roleName: { in: ["Parking Nord"] } },
    })
  })

  it("reads them all without a filter", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    await loadRecentCancellations({ registration: { findMany } } as unknown as OrgScopedPrisma, "evt-1", "Europe/Zurich", new Date("2026-07-04T12:00:00Z"))
    expect(findMany.mock.calls[0][0].where.shift).toEqual({ status: { not: "cancelled" }, date: { gte: new Date("2026-07-03T00:00:00Z") } })
  })
})
