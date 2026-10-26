import { describe, it, expect } from "vitest"
import {
  coveredRoleNames, leaderCoversRole, leaderInviteScope, leaderPageHeading, leaderRoleNamesOf, leaderScopeOf,
  leadersToNotify, leaderTitle, posteSectorsOf, scopeRoleNames,
} from "@/lib/leader-scope"

// #1169: an event with a sector « Parking » (Nord, Sud, École), a sector « Accueil » archived, and
// a poste « Bar » without sector.
const shifts = [
  { roleName: "Parking Nord", sectorId: "sec-parking" },
  { roleName: "Parking Nord", sectorId: "sec-parking" },
  { roleName: "Parking Sud", sectorId: "sec-parking" },
  { roleName: "École", sectorId: "sec-parking" },
  { roleName: "Bar", sectorId: null },
]
const sectors = [{ id: "sec-parking", archivedAt: null }, { id: "sec-accueil", archivedAt: new Date("2026-10-01") }]
const ctx = posteSectorsOf(shifts, sectors)

const parkingLeader = { roleName: null, sectorId: "sec-parking", email: "paula@example.org" }
const nordLeader = { roleName: "Parking Nord", sectorId: null, email: "nina@example.org" }

describe("leader scope (#1169)", () => {
  it("reads one poste or one sector, never both, and nothing for a malformed row", () => {
    expect(leaderScopeOf(nordLeader)).toEqual({ kind: "poste", roleName: "Parking Nord" })
    expect(leaderScopeOf(parkingLeader)).toEqual({ kind: "sector", sectorId: "sec-parking" })
    expect(leaderScopeOf({ roleName: null, sectorId: null })).toBeNull()
    expect(scopeRoleNames({ roleName: null, sectorId: null }, ctx)).toEqual([])
  })

  it("the Parking sector leader sees Nord, Sud and École; the Nord leader only Nord", () => {
    expect(scopeRoleNames(parkingLeader, ctx)).toEqual(["École", "Parking Nord", "Parking Sud"])
    expect(scopeRoleNames(nordLeader, ctx)).toEqual(["Parking Nord"])
    expect(leaderCoversRole(parkingLeader, "Bar", ctx)).toBe(false)
    expect(leaderCoversRole(nordLeader, "Parking Sud", ctx)).toBe(false)
    expect(leaderCoversRole(parkingLeader, "Parking Sud", ctx)).toBe(true)
  })

  it("B02: a poste moved out of the sector drops out at once", () => {
    const moved = posteSectorsOf(shifts.map((s) => (s.roleName === "École" ? { ...s, sectorId: null } : s)), sectors)
    expect(scopeRoleNames(parkingLeader, moved)).toEqual(["Parking Nord", "Parking Sud"])
    expect(leaderCoversRole(parkingLeader, "École", moved)).toBe(false)
  })

  it("follows the poste's majority rule, like the organisers' grouping", () => {
    // Two shifts of Sud in Parking, one left in « Autres postes » by a race: Sud stays in Parking.
    const split = posteSectorsOf([...shifts, { roleName: "Parking Sud", sectorId: "sec-parking" }, { roleName: "Parking Sud", sectorId: null }], sectors)
    expect(leaderCoversRole(parkingLeader, "Parking Sud", split)).toBe(true)
  })

  it("an archived or unknown sector covers nothing, even if a shift still points to it", () => {
    const stale = posteSectorsOf([...shifts, { roleName: "Accueil", sectorId: "sec-accueil" }], sectors)
    expect(scopeRoleNames({ roleName: null, sectorId: "sec-accueil" }, stale)).toEqual([])
    expect(leaderCoversRole({ roleName: null, sectorId: "sec-accueil" }, "Accueil", stale)).toBe(false)
    expect(scopeRoleNames({ roleName: null, sectorId: "sec-other-event" }, ctx)).toEqual([])
  })

  it("a poste leader keeps their poste even when it has no live shift (as before #1169)", () => {
    expect(scopeRoleNames({ roleName: "Vestiaire", sectorId: null }, ctx)).toEqual(["Vestiaire"])
  })

  it("dashboards count a poste covered by its sector's leader as having a leader", () => {
    expect(coveredRoleNames([parkingLeader], ctx).sort((a, b) => a.localeCompare(b, "fr"))).toEqual(["École", "Parking Nord", "Parking Sud"])
    expect(leaderRoleNamesOf([nordLeader], shifts, sectors)).toEqual(["Parking Nord"])
    expect(leaderRoleNamesOf([parkingLeader, { roleName: "Bar", sectorId: null }], shifts, sectors).sort((a, b) => a.localeCompare(b, "fr"))).toEqual(["Bar", "École", "Parking Nord", "Parking Sud"])
  })
})

describe("leadersToNotify (#1169)", () => {
  it("reaches the poste's leaders and its sector's, once per address, the sector row kept", () => {
    const rows = [
      { id: "1", ...nordLeader },
      { id: "2", ...parkingLeader },
      // Paula also leads Nord, typed with another casing: one email, with her sector link.
      { id: "3", roleName: "Parking Nord", sectorId: null, email: " PAULA@example.org" },
      { id: "4", roleName: "Bar", sectorId: null, email: "bob@example.org" },
    ]
    expect(leadersToNotify(rows, "Parking Nord", ctx).map((r) => r.id)).toEqual(["1", "2"])
    expect(leadersToNotify(rows, "Parking Sud", ctx).map((r) => r.id)).toEqual(["2"])
    expect(leadersToNotify(rows, "Bar", ctx).map((r) => r.id)).toEqual(["4"])
  })

  it("keeps the sector row whatever the order the rows come in", () => {
    const rows = [{ id: "s", ...parkingLeader }, { id: "p", roleName: "Parking Nord", sectorId: null, email: "paula@example.org" }]
    expect(leadersToNotify(rows, "Parking Nord", ctx).map((r) => r.id)).toEqual(["s"])
  })

  it("a revoked or out-of-scope leader gets nothing", () => {
    expect(leadersToNotify([], "Parking Nord", ctx)).toEqual([])
    const moved = posteSectorsOf(shifts.map((s) => (s.roleName === "École" ? { ...s, sectorId: null } : s)), sectors)
    expect(leadersToNotify([{ id: "2", ...parkingLeader }], "École", moved)).toEqual([])
  })
})

describe("leader labels (owner decision 2026-10-26)", () => {
  it("without sectors, nothing renamed: « Responsable · Bar » and no per-leader title", () => {
    expect(leaderPageHeading("Bar", "poste", false)).toBe("Responsable · Bar")
    expect(leaderTitle(nordLeader, false)).toBeNull()
  })

  it("with sectors adopted, « Responsable de poste » and « Responsable de secteur »", () => {
    expect(leaderPageHeading("Parking Nord", "poste", true)).toBe("Responsable de poste · Parking Nord")
    expect(leaderPageHeading("Parking", "sector", true)).toBe("Responsable de secteur · Parking")
    expect(leaderTitle(nordLeader, true)).toBe("Responsable de poste")
    expect(leaderTitle(parkingLeader, true)).toBe("Responsable de secteur")
  })

  it("the emails name the poste, or the sector with its kind", () => {
    expect(leaderInviteScope({ roleName: "Bar" })).toEqual({ roleName: "Bar" })
    expect(leaderInviteScope({ roleName: null, sector: { name: "Parking" } })).toEqual({ roleName: "Parking", scopeKind: "sector" })
    expect(leaderInviteScope({ roleName: null, sector: null })).toEqual({ roleName: "", scopeKind: "sector" })
  })
})
