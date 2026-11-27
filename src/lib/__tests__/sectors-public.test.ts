// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { groupShiftsBySector, NO_SECTOR_LABEL, publicSectorsOf, sectorRowGroups, SECTORS_OPTION_HINT } from "../sectors"
import { toPublicEvent, type PublicEventRow } from "../public-event"
import { duplicatePlan, type DuplicableEvent } from "../event-duplicate"

// Shifts grouped by sector on the sign-up page (#1469): only when the event chose it.
const ADOPTED = { sectorsEnabled: true, sectorsAdoptedAt: new Date("2026-10-26T10:00:00Z") }
const SECTORS = [
  { id: "sec-park", name: "Parking", displayOrder: 1, archivedAt: null },
  { id: "sec-bar", name: "Buvette", displayOrder: 0, archivedAt: null },
  { id: "sec-old", name: "Ancien secteur interne", displayOrder: 2, archivedAt: new Date() },
]

describe("publicSectorsOf", () => {
  it("gives nothing while the event has not chosen to group its shifts", () => {
    const out = publicSectorsOf({ ...ADOPTED, publicSectorGrouping: false, sectors: SECTORS })
    expect(out.sectors).toEqual([])
    expect(out.sectorOf("sec-park")).toBeNull()
  })

  it("gives nothing for an event that has not adopted sectors, even with the column on", () => {
    const out = publicSectorsOf({ sectorsEnabled: true, sectorsAdoptedAt: null, publicSectorGrouping: true, sectors: SECTORS })
    expect(out.sectors).toEqual([])
  })

  it("gives the active sectors in their order, and drops an archived or unknown sector", () => {
    const out = publicSectorsOf({ ...ADOPTED, publicSectorGrouping: true, sectors: SECTORS })
    expect(out.sectors).toEqual([{ id: "sec-bar", name: "Buvette" }, { id: "sec-park", name: "Parking" }])
    expect(out.sectorOf("sec-park")).toBe("sec-park")
    expect(out.sectorOf("sec-old")).toBeNull()
    expect(out.sectorOf("elsewhere")).toBeNull()
    expect(out.sectorOf(null)).toBeNull()
  })
})

describe("groupShiftsBySector", () => {
  const sectors = [{ id: "a", name: "Buvette" }, { id: "b", name: "Parking" }]

  it("does not group a day with no shift in a sector", () => {
    expect(groupShiftsBySector([{ id: "1", sectorId: null }], sectors)).toBeNull()
    expect(groupShiftsBySector([{ id: "1", sectorId: "a" }], [])).toBeNull()
  })

  it("follows the sectors' order, puts « Autres postes » last and skips empty groups", () => {
    const shifts = [{ id: "1", sectorId: null }, { id: "2", sectorId: "b" }, { id: "3", sectorId: "b" }, { id: "4", sectorId: "gone" }]
    const groups = groupShiftsBySector(shifts, sectors)!
    expect(groups.map((g) => g.name)).toEqual(["Parking", NO_SECTOR_LABEL])
    expect(groups[0].shifts.map((s) => s.id)).toEqual(["2", "3"])
    expect(groups[1]).toMatchObject({ id: null, shifts: [{ id: "1" }, { id: "4" }] })
  })
})

describe("sectorRowGroups (the frise's rows)", () => {
  const sectors = [{ id: "a", name: "Buvette" }, { id: "b", name: "Parking" }]
  const sectorOf = (role: string) => ({ "Parking Nord": "b", Bar: "a", Info: null } as Record<string, string | null>)[role]

  it("orders the postes sector by sector, keeping the postes' order inside, « Autres postes » last", () => {
    expect(sectorRowGroups(["Parking Nord", "Info", "Bar"], sectorOf, sectors)).toEqual([
      { id: "a", name: "Buvette", roles: ["Bar"] },
      { id: "b", name: "Parking", roles: ["Parking Nord"] },
      { id: null, name: NO_SECTOR_LABEL, roles: ["Info"] },
    ])
  })

  it("draws no groups when no poste of the day has a sector, or without sectors", () => {
    expect(sectorRowGroups(["Info"], sectorOf, sectors)).toBeNull()
    expect(sectorRowGroups(["Bar"], sectorOf, [])).toBeNull()
  })
})

describe("the organiser's hint", () => {
  it("no longer promises that volunteers never see the sectors", () => {
    expect(SECTORS_OPTION_HINT).toContain("sauf si vous choisissez de regrouper les créneaux par secteur sur la page d'inscription")
  })
})

function row(publicSectorGrouping: boolean): PublicEventRow {
  return {
    id: "e", slug: "fete", title: "Fête", description: null, location: null, startDate: new Date(), endDate: new Date(),
    publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [],
    organization: { name: "Org", slug: "org", volunteerCharter: null },
    pages: [],
    ...ADOPTED,
    publicSectorGrouping,
    sectors: SECTORS.filter((s) => !s.archivedAt),
    shifts: [{
      id: "s1", roleName: "Parking Nord", label: "Parking Nord", description: null, date: new Date(), startTime: "10:00", endTime: "12:00", capacity: 2, status: "open",
      locationDetails: null, contactName: null, contactPhone: null, instructions: null, sectorId: "sec-park",
      displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, registrations: [],
    }],
  } as unknown as PublicEventRow
}

describe("toPublicEvent and sectors", () => {
  it("never sends a sector name or id while the event has not chosen it", () => {
    const out = toPublicEvent(row(false))
    expect(out.sectors).toEqual([])
    expect(out.shifts[0].sectorId).toBeNull()
    const json = JSON.stringify(out)
    expect(json).not.toContain("Parking\"")
    expect(json).not.toContain("sec-park")
  })

  it("sends the sectors and each shift's sector once the event chose it", () => {
    const out = toPublicEvent(row(true))
    // « Buvette » has no published shift: its name is not sent.
    expect(out.sectors).toEqual([{ id: "sec-park", name: "Parking" }])
    expect(out.shifts[0].sectorId).toBe("sec-park")
    expect(JSON.stringify(out)).not.toContain("Buvette")
  })
})

describe("duplication", () => {
  const source = (grouping: boolean, adopted = true) => ({
    title: "Fête", slug: "fete", description: null, location: null, startDate: new Date("2031-06-06"), endDate: new Date("2031-06-06"),
    accentColorKey: null, showSchedule: [], shifts: [], pages: [], leaders: [],
    sectorsEnabled: adopted, sectorsAdoptedAt: adopted ? new Date() : null, sectors: adopted ? [{ id: "s", name: "Parking", displayOrder: 0, archivedAt: null }] : [],
    publicSectorGrouping: grouping,
  }) as unknown as DuplicableEvent

  it("copies the choice with the settings, for a source that adopted sectors", () => {
    expect(duplicatePlan(source(true), { copy: { settings: true } }).event.publicSectorGrouping).toBe(true)
  })

  it("starts off when the settings are not copied, or without sectors", () => {
    expect(duplicatePlan(source(true), { copy: { settings: false } }).event.publicSectorGrouping).toBe(false)
    expect(duplicatePlan(source(true, false), { copy: { settings: true } }).event.publicSectorGrouping).toBe(false)
  })
})
