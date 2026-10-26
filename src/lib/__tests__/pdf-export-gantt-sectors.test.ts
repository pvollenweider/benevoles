import { describe, it, expect } from "vitest"
import { buildDayParts, type ShiftRow } from "../pdf-export-gantt"

// The PDF print grouped by sector (#1147): one body per sector, « Sans secteur » last, the sector
// heading its row group, the poste only its own rows; an event without sectors is unchanged.
const shift = (o: Partial<ShiftRow> & Pick<ShiftRow, "id" | "roleName" | "startTime" | "endTime">): ShiftRow => ({
  label: o.roleName, date: new Date("2026-07-10"), capacity: 5, status: "open", displayOrder: 0, registrations: [], waitlistEntries: [], ...o,
})
const shifts = [
  shift({ id: "1", roleName: "Bar", startTime: "10:00", endTime: "12:00", displayOrder: 0 }),
  shift({ id: "2", roleName: "Parking Nord", startTime: "08:00", endTime: "10:00", displayOrder: 100 }),
  shift({ id: "3", roleName: "Parking Mairie", startTime: "09:00", endTime: "11:00", displayOrder: 200 }),
]
const bySector = {
  sectors: [{ id: "p", name: "Parking", displayOrder: 0 }, { id: "x", name: "Vide", displayOrder: 1 }],
  sectorOf: { "Bar": null, "Parking Nord": "p", "Parking Mairie": "p" } as Record<string, string | null>,
}

describe("buildDayParts by sector (#1147)", () => {
  it("draws each sector as its own body, its postes in order, « Sans secteur » last, empty sectors left out", () => {
    const { gantt, recap } = buildDayParts(new Date("2026-07-10"), shifts, [], false, bySector)
    for (const html of [gantt, recap]) {
      expect(html.match(/<tbody class="sector-group">/g)).toHaveLength(2)
      expect(html.indexOf("Secteur Parking")).toBeLessThan(html.indexOf("Parking Nord"))
      expect(html.indexOf("Parking Nord")).toBeLessThan(html.indexOf("Parking Mairie"))
      expect(html.indexOf("Parking Mairie")).toBeLessThan(html.indexOf(">Sans secteur<"))
      expect(html.indexOf(">Sans secteur<")).toBeLessThan(html.lastIndexOf(">Bar<"))
      expect(html).not.toContain("Secteur Vide")
    }
    expect(gantt).toMatch(/<th scope="rowgroup" colspan="\d+" class="sector-cell">Secteur Parking<\/th>/)
  })

  it("A07: a poste moved to another sector prints in its new group", () => {
    const moved = { ...bySector, sectorOf: { ...bySector.sectorOf, "Bar": "p" } }
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false, moved)
    expect(gantt).not.toContain("Sans secteur")
    expect(gantt.match(/<tbody class="sector-group">/g)).toHaveLength(1)
  })

  it("keeps the export of an event without sectors as before: one body, no sector row", () => {
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    expect(gantt).not.toContain("sector")
    expect(gantt.match(/<tbody>/g)).toHaveLength(1)
  })
})
