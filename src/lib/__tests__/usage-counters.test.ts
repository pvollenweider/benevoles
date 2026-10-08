import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { countBy, cumulativeRows, currentRows, formatCount, USAGE_METRICS } from "../usage-counters"

const MIGRATION = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261008150000_usage_counters/migration.sql"), "utf8")

describe("cumulative usage rows (#805)", () => {
  it("lists every metric in order, 0 when not counted yet, BigInt values as numbers", () => {
    const rows = cumulativeRows([{ metric: "shifts", value: BigInt(12) }, { metric: "organizations", value: 3 }], "platform")
    expect(rows.map((r) => r.key)).toEqual(USAGE_METRICS.map((m) => m.key))
    expect(rows.find((r) => r.key === "shifts")?.value).toBe(12)
    expect(rows.find((r) => r.key === "organizations")?.value).toBe(3)
    expect(rows.find((r) => r.key === "registrations")?.value).toBe(0)
  })

  it("leaves the platform-only metrics out of an organisation, and ignores unknown metrics", () => {
    const rows = cumulativeRows([{ metric: "organizations", value: 9 }, { metric: "something_else", value: 4 }], "organization")
    expect(rows.map((r) => r.key)).not.toContain("organizations")
    expect(rows.map((r) => r.key)).not.toContain("something_else")
    expect(rows).toHaveLength(USAGE_METRICS.length - 1)
  })

  // The triggers and the backfill write the `metric` keys; a key renamed on one side only would
  // show 0 forever.
  it("matches the metrics the migration's triggers and backfill write", () => {
    const triggered = [...MIGRATION.matchAll(/usage_counter_increment\('([a-z_]+)'/g)].map((m) => m[1])
    expect(new Set(triggered)).toEqual(new Set(USAGE_METRICS.map((m) => m.key)))
    for (const m of USAGE_METRICS) expect(MIGRATION).toContain(`SELECT '${m.key}', COUNT(*)`)
  })
})

describe("current usage rows (#805)", () => {
  it("folds groupBy results into named buckets", () => {
    const roles = countBy(
      [{ key: "admin", count: 3 }, { key: "organizer", count: 2 }, { key: "super_admin", count: 1 }, { key: "benevole", count: 7 }, { key: null, count: 5 }],
      { owners: ["admin"], organizers: ["organizer"], superAdmins: ["super_admin"] },
    )
    expect(roles).toEqual({ owners: 3, organizers: 2, superAdmins: 1 })
  })

  it("lists organisations, events, members, admins by role and sector leaders", () => {
    const rows = currentRows({
      organizations: { active: 4, inactive: 1 },
      admins: { owners: 4, organizers: 6, superAdmins: 1 },
      sectorLeaders: 8,
      members: { active: 120, inactive: 3 },
      events: { draft: 2, published: 5, archived: 7 },
    })
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Organisations actives", 4],
      ["Organisations désactivées", 1],
      ["Événements publiés", 5],
      ["Événements en brouillon", 2],
      ["Événements archivés", 7],
      ["Membres actifs", 120],
      ["Membres désactivés", 3],
      ["Propriétaires", 4],
      ["Organisateurs", 6],
      ["Super admins", 1],
      ["Responsables de secteur", 8],
    ])
  })

  it("formats counts the French way", () => {
    expect(formatCount(12345).replace(/\s/g, " ")).toBe("12 345")
    expect(formatCount(0)).toBe("0")
  })
})
