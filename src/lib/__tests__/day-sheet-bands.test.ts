import { describe, it, expect } from "vitest"
import { bandStepMinutes, dayAxis, dayBands, shouldSplitDay } from "../day-sheet-bands"
import { renderSheet, type SheetData, type SheetShift } from "../print-sheets"

const person = (n: number) => ({ firstName: `Bénévole${n}`, lastName: "Test", email: `b${n}@example.test`, phone: null })

/** Minutes since midnight → the "HH:MM" stored on a shift, wrapping at midnight. */
const clock = (mins: number) =>
  `${String(Math.floor((mins % 1440) / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`

const shift = (over: Partial<SheetShift> & Pick<SheetShift, "id" | "roleName" | "startTime" | "endTime">): SheetShift => ({
  label: over.roleName,
  date: "2026-07-04",
  capacity: 2,
  displayOrder: 0,
  registrations: [],
  ...over,
})

const sheet = (shifts: SheetShift[]): SheetData => ({
  eventTitle: "Fête d'été",
  organizationName: "Org",
  printedAt: "04.07.2026 08:00",
  shifts,
  leaders: [],
})

/** The production-like relay day: 24 h of 30-minute shifts on 8 roles. */
function relayDay(roles = 8): SheetShift[] {
  const shifts: SheetShift[] = []
  for (let role = 0; role < roles; role++) {
    for (let mins = 0; mins < 1440; mins += 30) {
      const id = `r${role}-${mins}`
      shifts.push(shift({
        id, roleName: `Poste ${role}`, startTime: clock(mins), endTime: clock(mins + 30),
        registrations: mins % 90 === 0 ? [] : [person(role * 100 + mins / 30)],
      }))
    }
  }
  return shifts
}

/** A dense day of 30-minute shifts from 10:00 to 22:00, one role, enough to split. */
function denseDay(): SheetShift[] {
  const shifts: SheetShift[] = []
  for (let mins = 10 * 60; mins < 22 * 60; mins += 30) {
    const i = (mins - 600) / 30
    shifts.push(shift({
      id: `d${i}`, roleName: "Accueil", startTime: clock(mins), endTime: clock(mins + 30),
      capacity: 2,
      registrations: i === 0 ? [person(1)] : i === 1 ? [] : i % 2 === 0 ? [person(2), person(3)] : [person(4)],
    }))
  }
  return shifts
}

describe("shouldSplitDay (#1431)", () => {
  it("splits the production-like relay day: 24 h × 30-minute shifts × 8 roles", () => {
    expect(shouldSplitDay(relayDay())).toBe(true)
  })

  it("does not split a festival day with six long shifts", () => {
    const shifts = [
      shift({ id: "a", roleName: "Bar", startTime: "10:00", endTime: "14:00" }),
      shift({ id: "b", roleName: "Accueil", startTime: "10:00", endTime: "14:00" }),
      shift({ id: "c", roleName: "Cuisine", startTime: "10:00", endTime: "16:00" }),
      shift({ id: "d", roleName: "Bar", startTime: "14:00", endTime: "18:00" }),
      shift({ id: "e", roleName: "Accueil", startTime: "14:00", endTime: "18:00" }),
      shift({ id: "f", roleName: "Cuisine", startTime: "16:00", endTime: "22:00" }),
    ]
    expect(shouldSplitDay(shifts)).toBe(false)
  })

  it("does not split a morning with six short shifts: count and span both stay under the rule", () => {
    const shifts = Array.from({ length: 6 }, (_, i) =>
      shift({ id: `m${i}`, roleName: "Montage", startTime: clock(8 * 60 + i * 30), endTime: clock(8 * 60 + i * 30 + 30) }))
    expect(shouldSplitDay(shifts)).toBe(false)
  })

  it("splits when the narrowest shift would print under 28 px, even with few short shifts", () => {
    // 08:00–20:00 (48 quarter-hour columns) with a single 15-minute shift: 19 px wide on paper.
    const shifts = [
      shift({ id: "long1", roleName: "Bar", startTime: "08:00", endTime: "11:00" }),
      shift({ id: "long2", roleName: "Accueil", startTime: "11:00", endTime: "14:00" }),
      shift({ id: "long3", roleName: "Cuisine", startTime: "14:00", endTime: "17:00" }),
      shift({ id: "long4", roleName: "Bar", startTime: "17:00", endTime: "20:00" }),
      shift({ id: "short", roleName: "Loge", startTime: "12:00", endTime: "12:15" }),
    ]
    expect(shouldSplitDay(shifts)).toBe(true)
  })

  it("never splits an empty day", () => {
    expect(shouldSplitDay([])).toBe(false)
  })
})

describe("band geometry (#1431)", () => {
  it("uses the day's regular 30-minute step on the relay day", () => {
    expect(bandStepMinutes(relayDay())).toBe(30)
    expect(dayAxis(relayDay())).toEqual({ startMin: 0, endMin: 1440, step: 30 })
  })

  it("falls back to 30 minutes when a boundary is irregular (23:59)", () => {
    expect(bandStepMinutes([shift({ id: "a", roleName: "Bar", startTime: "18:00", endTime: "23:59" })])).toBe(30)
  })

  it("keeps a 60-minute grid when every boundary is on the hour", () => {
    expect(bandStepMinutes([
      shift({ id: "a", roleName: "Bar", startTime: "08:00", endTime: "10:00" }),
      shift({ id: "b", roleName: "Bar", startTime: "10:00", endTime: "12:00" }),
    ])).toBe(60)
  })

  it("prints the four 6-hour bands of a 24-hour day, in order", () => {
    expect(dayBands(relayDay()).map((b) => [b.startMin, b.endMin])).toEqual([
      [0, 360], [360, 720], [720, 1080], [1080, 1440],
    ])
  })

  it("limits the bands to the hours the day uses, and omits a window without a shift", () => {
    const bands = dayBands([
      shift({ id: "a", roleName: "Bar", startTime: "08:00", endTime: "10:00" }),
      shift({ id: "b", roleName: "Bar", startTime: "12:00", endTime: "14:00" }),
      shift({ id: "c", roleName: "Bar", startTime: "20:00", endTime: "22:00" }),
    ])
    expect(bands.map((b) => [b.startMin, b.endMin])).toEqual([[480, 720], [720, 1080], [1080, 1320]])
  })

  it("keeps a single band for a short afternoon", () => {
    expect(dayBands([shift({ id: "a", roleName: "Bar", startTime: "13:00", endTime: "15:00" })])
      .map((b) => [b.startMin, b.endMin])).toEqual([[780, 900]])
  })

  it("ends the last band at 24:00 for a shift ending at 00:00", () => {
    const bands = dayBands([
      shift({ id: "a", roleName: "Bar", startTime: "18:00", endTime: "23:00" }),
      shift({ id: "b", roleName: "Bar", startTime: "23:00", endTime: "00:00" }),
    ])
    expect(bands.at(-1)).toEqual({ startMin: 1080, endMin: 1440, nextDay: false })
  })

  it("ends the last band at 24:00 for a shift ending at 23:59", () => {
    const bands = dayBands([
      shift({ id: "a", roleName: "Bar", startTime: "18:00", endTime: "23:00" }),
      shift({ id: "b", roleName: "Bar", startTime: "23:00", endTime: "23:59" }),
    ])
    expect(bands.at(-1)).toEqual({ startMin: 1080, endMin: 1440, nextDay: false })
  })

  it("adds a next-day band for a shift running past midnight", () => {
    const bands = dayBands([
      shift({ id: "a", roleName: "Bar", startTime: "22:00", endTime: "02:00" }),
    ])
    expect(bands).toEqual([
      { startMin: 1320, endMin: 1440, nextDay: false },
      { startMin: 1440, endMin: 1560, nextDay: true },
    ])
  })
})

describe("split day sheet (#1431)", () => {
  it("prints the overview with n/places per shift, then the bands, with captions", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain("<caption class=\"band-caption\">Vue d'ensemble du samedi 4 juillet 2026</caption>")
    expect(html).toContain("<caption class=\"band-caption\">Frise horaire du samedi 4 juillet 2026 de 10h à 12h</caption>")
    expect(html).toContain("<caption class=\"band-caption\">Frise horaire du samedi 4 juillet 2026 de 12h à 18h</caption>")
    expect(html).toContain("<caption class=\"band-caption\">Frise horaire du samedi 4 juillet 2026 de 18h à 22h</caption>")
    expect(html).toContain('<strong class="mono" aria-hidden="true">1/<wbr>2</strong>')
    expect(html).toContain('<strong class="mono" aria-hidden="true">0/<wbr>2</strong>')
    expect(html).toContain('<strong class="mono" aria-hidden="true">2/<wbr>2</strong>')
    // The overview's figures are hidden; screen readers get the full sentence, with « à ».
    expect(html).toContain('<span class="sr-only">de 10:00 à 10:30, 1 inscrit sur 2 places</span><strong class="mono" aria-hidden="true">1/<wbr>2</strong>')
    expect(html).not.toContain("10:00–10:30")
  })

  it("adds the count after the names of a partial band cell, in normal weight", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain('<span class="fill-count" aria-hidden="true">1/<wbr>2</span><span class="sr-only">, 1 inscrit sur 2 places</span>')
    expect(html).toContain(".fill-count { display: inline-block; font-weight: 400;")
    expect(html).toContain(".overview-table .shift-cell strong, .fill-count { background: #fff;")
    // A complete shift has names only, no fill-count after them.
    const complete = html.split('<span class="sr-only">de 11:00 à 11:30</span>')[1].split("</td>")[0]
    expect(complete).not.toContain("fill-count")
  })

  it("labels the overview and the bands by role and by label when the role has several labels", () => {
    const shifts = Array.from({ length: 24 }, (_, i) => shift({
      id: `s${i}`, roleName: "Bar", label: i % 2 === 0 ? "Bar · service" : "Bar · soir",
      startTime: clock(10 * 60 + i * 30), endTime: clock(10 * 60 + (i + 1) * 30),
    }))
    const html = renderSheet("day", sheet(shifts))
    expect(html).toContain('<th scope="col" class="th-label">Libellé</th>')
    expect(html).toContain('<th scope="row" class="label-cell">Bar · service</th>')
    expect(html).toContain('<th scope="row" class="label-cell">Bar · soir</th>')
    // Rowspan role headers are row headers, never rowgroup headers.
    expect(html).toContain('<th scope="row" class="role-cell" rowspan="2">Bar</th>')
    expect(html).not.toContain('<th scope="rowgroup" class="role-cell"')
  })

  it("uses the full legend: a visible title, the count sample and the empty-cell sample", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain('<ul class="legend" aria-label="Légende">')
    expect(html).toContain("<li>Légende :</li>")
    expect(html).toContain("2/3 inscrits / places</li>")
    expect(html).toContain("— personne d'inscrit</li>")
  })

  it("keeps the overview figures at 9 px on screen, 8 px in print, with a break after the slash", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain(".overview-table .shift-cell { border: 1px solid var(--ink) !important; padding: 0 1px; text-align: center; font-size: 9px;")
    expect(html).toContain(".overview-table .shift-cell { font-size: 8px; }")
    expect(html).toMatch(/\.overview-table \.shift-cell strong, \.fill-count \{[^}]*print-color-adjust: exact/)
    expect(html).toContain("1/<wbr>2")
  })

  it("keeps table rows and headings out of page-break hazards", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain(".gantt-table tr { page-break-inside: avoid; break-inside: avoid; }")
    expect(html).toContain(".section-head, .legend, .band-caption, h3, .individual-table caption { break-after: avoid; }")
  })

  it("omits the detail table only on a split day", () => {
    const split = renderSheet("day", sheet(denseDay()))
    expect(split).not.toContain('class="detail"')
    expect(split).not.toContain("Détail des créneaux")

    const plain = renderSheet("day", sheet([
      shift({ id: "a", roleName: "Bar", startTime: "10:00", endTime: "14:00" }),
      shift({ id: "b", roleName: "Accueil", startTime: "10:00", endTime: "14:00" }),
    ]))
    expect(plain).toContain('class="detail"')
    expect(plain).toContain("Détail des créneaux du samedi 4 juillet 2026")
    expect(plain).not.toContain("Vue d'ensemble")
  })

  it("keeps one column per 30-minute shift in a band, and 48 half-hour columns in the overview", () => {
    const html = renderSheet("day", sheet(relayDay(1)))
    expect(html).toMatch(/<div class="overview-table">[\s\S]*?<table class="gantt-table">[\s\S]*?<col span="48" style="width:1\.8541%">/)
    expect(html).toMatch(/<div class="band-table">[\s\S]*?<table class="gantt-table">[\s\S]*?<col span="12" style="width:7\.4166%">/)
    // Five timelines: the overview and the four 6-hour bands, each keeping the sheet's Gantt markup.
    expect((html.match(/class="gantt-table"/g) ?? []).length).toBe(5)
  })

  it("shows names one per line, and « — » plus « personne » for a shift nobody took", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain("<br>")
    expect(html).toContain('<span aria-hidden="true">—</span><span class="sr-only">personne</span>')
  })

  it("uses the three black-and-white fill states and the legend words", () => {
    const html = renderSheet("day", sheet(denseDay()))
    expect(html).toContain('class="shift-cell" data-fill="complete"')
    expect(html).toContain('class="shift-cell" data-fill="free"')
    expect(html).toContain('class="shift-cell" data-fill="empty"')
    // Every shift bar keeps the sheet's exact Gantt class; the fill state is a data attribute.
    expect((html.match(/class="shift-cell"/g) ?? []).length).toBe(48)
    expect(html).toContain("complet</li>")
    expect(html).toContain("places libres</li>")
    expect(html).toContain("personne</li>")
    expect(html).toContain("repeating-linear-gradient(135deg,#fff 0 3px,#d9d9d9 3px 5px)")
    expect(html).toContain("repeating-linear-gradient(135deg,#fff 0 2px,#9a9a9a 2px 4px)")
    expect(html).toContain("print-color-adjust: exact")
    expect(html).toContain("break-inside: avoid")
  })

  it("keeps a band table together and leaves the overview with the first band", () => {
    const html = renderSheet("day", sheet(denseDay()))
    const css = html.split("<style>")[1].split("</style>")[0]
    expect(css).toMatch(/\.band-table[^{]*\{[^}]*break-inside: avoid/)
    expect(html).not.toContain('class="band-table page-before"')
  })

  it("does not split a day whose shifts end at 23:59 or 00:00 without the density rule", () => {
    const plain = renderSheet("day", sheet([
      shift({ id: "a", roleName: "Bar", startTime: "18:00", endTime: "23:00" }),
      shift({ id: "b", roleName: "Bar", startTime: "23:00", endTime: "23:59" }),
    ]))
    expect(plain).toContain('class="detail"')
    expect(plain).not.toContain("Vue d'ensemble")
  })
})
