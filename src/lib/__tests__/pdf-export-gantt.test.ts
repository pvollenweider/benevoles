import { describe, it, expect } from "vitest"
import { buildDayParts, ganttColumnWidths, type ShiftRow } from "../pdf-export-gantt"

function shift(overrides: Partial<ShiftRow> & Pick<ShiftRow, "id" | "roleName" | "startTime" | "endTime">): ShiftRow {
  return {
    label: overrides.roleName,
    date: new Date("2026-07-10"),
    capacity: 5,
    status: "open",
    displayOrder: 0,
    registrations: [],
    waitlistEntries: [],
    ...overrides,
  }
}

describe("buildDayParts (PDF export)", () => {
  it("bounds the day range to the shifts' own start/end, not 00:00-24:00 (#221 regression)", () => {
    const shifts = [shift({ id: "1", roleName: "Bar", startTime: "18:00", endTime: "23:30" })]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    // Hour markers only appear for hours actually in range — 00h/01h.../23h would all be present
    // for a full-day export, so their absence here proves the range is bounded.
    expect(gantt).toContain(">18h<")
    expect(gantt).not.toContain(">00h<")
    expect(gantt).not.toContain(">05h<")
  })

  it("still bounds the range correctly when an overnight shift is on the same day (#221)", () => {
    // An overnight shift's end ("02:00") is numerically smaller than its own start (1320 min) —
    // buildDayParts must roll it forward (+1440) via toMinEnd, not treat 02:00 as an early-morning
    // anchor that drags the whole day's range back down to 00:00.
    const shifts = [
      shift({ id: "1", roleName: "Sécurité", startTime: "22:00", endTime: "02:00" }),
      shift({ id: "2", roleName: "Bar", startTime: "18:00", endTime: "23:00" }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    expect(gantt).toContain(">18h<")
    // The day should not have been dragged back to start at midnight because of the overnight
    // shift's raw (small) end-time value.
    expect(gantt).not.toContain(">00h<")
  })

  it("orders roles by the admin's stored displayOrder, not first chronological appearance (#222 regression)", () => {
    // "Sécurité" starts earlier in the day than "Bar" but was explicitly reordered to come
    // *after* it (displayOrder 100 vs 0) — the Gantt's role-cell order must follow that, even
    // though a naive first-appearance scan (sorted by startTime upstream) would see Sécurité first.
    const shifts = [
      shift({ id: "1", roleName: "Sécurité", startTime: "08:00", endTime: "10:00", displayOrder: 100 }),
      shift({ id: "2", roleName: "Bar", startTime: "18:00", endTime: "20:00", displayOrder: 0 }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    const barIndex = gantt.indexOf(">Bar<")
    const secuIndex = gantt.indexOf(">Sécurité<")
    expect(barIndex).toBeGreaterThan(-1)
    expect(secuIndex).toBeGreaterThan(-1)
    expect(barIndex).toBeLessThan(secuIndex)
  })

  it("falls back to first appearance when roles were never reordered (displayOrder all 0)", () => {
    const shifts = [
      shift({ id: "1", roleName: "Accueil", startTime: "08:00", endTime: "10:00" }),
      shift({ id: "2", roleName: "Bar", startTime: "18:00", endTime: "20:00" }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    const accueilIndex = gantt.indexOf(">Accueil<")
    const barIndex = gantt.indexOf(">Bar<")
    expect(accueilIndex).toBeLessThan(barIndex)
  })

  it("wraps hours past midnight back to 00h instead of printing 24h/25h/26h (regression)", () => {
    // Overnight shifts are stored with an hour above 23 on the raw "HH:MM" string itself
    // (e.g. "26:00" for 2am the next morning) — the same convention fmt() in gantt-utils.ts
    // already reads modulo 24 for the on-screen timeline. The axis header and the recap table's
    // Début/Fin columns must read it the same way, not print the raw hour past 24.
    const shifts = [shift({ id: "1", roleName: "Buvette", startTime: "24:00", endTime: "26:00" })]
    const { gantt, recap } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    expect(gantt).toContain(">0h<")
    expect(gantt).not.toContain(">24h<")
    expect(gantt).not.toContain(">25h<")
    expect(gantt).not.toContain(">26h<")
    expect(recap).toContain('class="center">0h<')
    expect(recap).toContain('class="center">2h<')
    expect(recap).not.toContain(">24h<")
    expect(recap).not.toContain(">26h<")
  })

  it("omits the Libellé column entirely when no shift that day has a label distinct from its role", () => {
    const shifts = [shift({ id: "1", roleName: "Bar", startTime: "18:00", endTime: "20:00" })]
    const { gantt, recap } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    expect(gantt).not.toContain("th-label")
    expect(gantt).not.toContain("Libellé")
    expect(gantt).not.toContain("label-cell")
    expect(recap).not.toContain("Libellé")
  })

  it("keeps the Libellé column when at least one shift that day has a distinct label", () => {
    const shifts = [
      shift({ id: "1", roleName: "Bar", label: "Bar — service", startTime: "18:00", endTime: "20:00" }),
      shift({ id: "2", roleName: "Accueil", startTime: "18:00", endTime: "20:00" }),
    ]
    const { gantt, recap } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    expect(gantt).toContain("th-label")
    expect(gantt).toContain("Bar — service")
    expect(recap).toContain("Libellé")
    expect(recap).toContain("Bar — service")
    // The label is a row header when it differs, an empty cell when the label is just the role.
    expect(gantt).toContain('<th scope="row" class="label-cell">Bar — service</th>')
    expect(gantt).toContain('<td class="label-cell"></td>')
  })

  it("scales the time axis to the page width instead of overflowing it (#923 regression)", () => {
    // 08:00 to 02:00 is 72 quarter-hour slots: with a minimum width per slot the table ran past
    // the right edge of the page and of the screen preview, cutting the evening off.
    const shifts = [
      shift({ id: "1", roleName: "Accueil", startTime: "08:00", endTime: "10:00" }),
      shift({ id: "2", roleName: "Loge", label: "Rangement de nuit", startTime: "22:00", endTime: "02:00" }),
    ]
    const { gantt } = buildDayParts(new Date("2026-10-10"), shifts, [], false)
    const cols = [...gantt.matchAll(/<col(?: span="(\d+)")? style="width:([\d.]+)%">/g)]
    expect(cols).toHaveLength(3) // role, label, then one col element spanning every slot
    expect(Number(cols[2][1])).toBe(72)
    const total = Number(cols[0][2]) + Number(cols[1][2]) + Number(cols[2][1]) * Number(cols[2][2])
    expect(total).toBeLessThanOrEqual(100)
    expect(total).toBeGreaterThan(99.9)
    // The last hour is still on the axis.
    expect(gantt).toContain(">1h<")
  })
})

describe("ganttColumnWidths (#923)", () => {
  it("never adds up to more than the page width, with or without the label column", () => {
    for (const hasLabel of [true, false]) for (const n of [1, 4, 7, 72, 96, 200]) {
      const w = ganttColumnWidths(n, hasLabel)
      const sum = w.role + (w.label ?? 0) + n * w.slot
      expect(sum).toBeLessThanOrEqual(100)
      expect(sum).toBeGreaterThan(99.9)
    }
  })

  it("gives the label column a share only when there is one", () => {
    expect(ganttColumnWidths(8, true).label).toBe(10)
    expect(ganttColumnWidths(8, false).label).toBeNull()
    expect(ganttColumnWidths(8, false).role).toBeGreaterThan(ganttColumnWidths(8, true).role)
  })

  it("has no slot width for an empty axis", () => {
    expect(ganttColumnWidths(0, false).slot).toBe(0)
  })
})

// Dense day (#1431): the full export shares the printable day sheet's rule and band geometry.
describe("buildDayParts dense day (#1431)", () => {
  const reg = (firstName: string) => ({
    volunteer: { firstName, lastName: "Test", email: `${firstName.toLowerCase()}@example.test`, phone: null },
    comment: null,
    source: "",
  })
  const pad = (n: number) => String(n).padStart(2, "0")
  const clock = (mins: number) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`

  /** 24 h of 30-minute shifts on `roles` roles: the production-like relay day. */
  function relayDay(roles = 2): ShiftRow[] {
    const out: ShiftRow[] = []
    for (let role = 0; role < roles; role++) for (let mins = 0; mins < 1440; mins += 30) {
      const index = role * 48 + mins / 30
      out.push(shift({
        id: `relay-${role}-${mins}`, roleName: `Relais ${role + 1}`,
        startTime: clock(mins), endTime: clock(mins + 30), capacity: 2,
        registrations: index % 4 === 0 ? [] : index % 4 === 2 ? [reg("Alice"), reg("Bastien")] : [reg(index % 4 === 1 ? "Alice" : "Bastien")],
      }))
    }
    return out
  }

  it("prints the overview and the four 6-hour bands instead of the single timeline", () => {
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), relayDay(), [], false)
    expect(gantt).toContain("Vue d'ensemble du samedi 4 juillet 2026")
    expect(gantt).toContain("Frise horaire du samedi 4 juillet 2026 de 0h à 6h")
    expect(gantt).toContain("Frise horaire du samedi 4 juillet 2026 de 6h à 12h")
    expect(gantt).toContain("Frise horaire du samedi 4 juillet 2026 de 12h à 18h")
    expect(gantt).toContain("Frise horaire du samedi 4 juillet 2026 de 18h à 24h")
    expect((gantt.match(/class="gantt-table dense-overview"/g) ?? []).length).toBe(1)
    expect((gantt.match(/class="gantt-table dense-band"/g) ?? []).length).toBe(4)
    // One n/places cell per shift in the overview, and names one per line in the bands.
    expect((gantt.match(/<strong class="mono"/g) ?? []).length).toBe(96)
    expect(gantt).toContain('<span class="sr-only">de 00:00 à 00:30, 0 inscrit sur 2 places</span><strong class="mono" aria-hidden="true">0/<wbr>2</strong>')
    expect(gantt).toContain('<span class="fill-count" aria-hidden="true">1/<wbr>2</span><span class="sr-only">, 1 inscrit sur 2 places</span>')
    expect(gantt).toContain("<br>")
    expect(gantt).toContain("Alice")
    expect(gantt).not.toContain("00:00–00:30")
  })

  it("leaves out the day's recap table, with a note saying the bands carry the names", () => {
    const { recap } = buildDayParts(new Date("2026-07-04T00:00:00Z"), relayDay(), [], false)
    expect(recap).not.toContain("recap-table")
    expect(recap).not.toContain("<td")
    expect(recap).toContain("Journée dense")
    expect(recap).toContain("n'est pas repris")
  })

  it("still prints the recap table for a day with a few long shifts", () => {
    const { gantt, recap } = buildDayParts(new Date("2026-07-04T00:00:00Z"), [
      shift({ id: "a", roleName: "Bar", startTime: "10:00", endTime: "14:00", registrations: [reg("Alice")] }),
      shift({ id: "b", roleName: "Accueil", startTime: "14:00", endTime: "18:00", registrations: [reg("Bastien")] }),
    ], [], false)
    expect(gantt).not.toContain("dense-overview")
    expect(recap).toContain("recap-table")
    expect(recap).not.toContain("Journée dense")
  })

  it("never labels a band table as the overview, even when the day fits one band", () => {
    // A 08:00–20:00 day whose narrowest 15-minute shift prints under 28 px: split by width, and
    // its three 6-hour windows are bands, never a second overview.
    const shifts = [
      ...Array.from({ length: 12 }, (_, i) => shift({
        id: `short-${i}`, roleName: "Loge", startTime: clock(8 * 60 + i * 15), endTime: clock(8 * 60 + (i + 1) * 15),
      })),
      shift({ id: "long", roleName: "Loge", startTime: "11:00", endTime: "20:00" }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), shifts, [], false)
    expect((gantt.match(/dense-overview/g) ?? []).length).toBe(1)
    expect((gantt.match(/dense-band/g) ?? []).length).toBe(3)
  })

  it("keeps each poste under its sector heading in the overview and the bands (#1147)", () => {
    const bySector = {
      sectors: [
        { id: "s1", name: "Restauration", displayOrder: 0, archivedAt: null },
        { id: "s2", name: "Accueil", displayOrder: 1, archivedAt: null },
      ],
      sectorOf: { "Relais 1": "s1", "Relais 2": "s2" },
    }
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), relayDay(), [], false, bySector)
    expect(gantt).toContain("Secteur Restauration")
    expect(gantt).toContain("Secteur Accueil")
  })

  it("can keep the single timeline for the per-role and per-volunteer sheets", () => {
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), relayDay(), [], false, undefined, { dense: false })
    expect(gantt).not.toContain("dense-overview")
    expect(gantt).not.toContain("dense-band")
    expect(gantt).toContain('class="gantt-table"')
  })

  it("keeps the show row in each band where the show runs", () => {
    const days = [shift({ id: "a", roleName: "Bar", startTime: "10:00", endTime: "10:30" })]
    for (let i = 0; i < 24; i++) days.push(shift({ id: `b${i}`, roleName: "Bar", startTime: clock(10 * 60 + i * 30), endTime: clock(10 * 60 + (i + 1) * 30) }))
    const shows = [{ name: "Concert", date: "2026-07-04", startTime: "19:00", endTime: "23:00" }]
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), days, shows, false)
    expect(gantt).toContain("Concert")
    // The show row has a row header, and the emoji is decorative.
    expect(gantt).toContain('<th scope="row" class="show-label-cell">Spectacles</th>')
    expect(gantt).toContain('<span aria-hidden="true">🎪</span> Concert')
    // The show extends the day's axis (18h–23h) and appears once in the overview, once in its band.
    expect(gantt).toContain("de 18h à 23h")
    expect((gantt.match(/<span aria-hidden="true">🎪<\/span> Concert/g) ?? []).length).toBe(2)
  })

  it("heads a role's several labels with row headers, never rowgroup, in the dense bands", () => {
    const shifts = Array.from({ length: 24 }, (_, i) => shift({
      id: `label-${i}`, roleName: "Bar", label: i % 2 === 0 ? "Bar · service" : "Bar · soir",
      startTime: clock(10 * 60 + i * 30), endTime: clock(10 * 60 + (i + 1) * 30),
    }))
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), shifts, [], false)
    expect(gantt).toContain('<th scope="row" class="role-cell" rowspan="2">Bar</th>')
    expect(gantt).toContain('<th scope="row" class="label-cell">Bar · service</th>')
    expect(gantt).toContain('<th scope="row" class="label-cell">Bar · soir</th>')
    expect(gantt).not.toContain('<th scope="rowgroup" class="role-cell"')
  })

  it("labels the show row and hides the emoji in the single timeline too", () => {
    const shifts = [shift({ id: "a", roleName: "Bar", startTime: "10:00", endTime: "14:00" })]
    const shows = [{ name: "Concert", date: "2026-07-04", startTime: "19:00", endTime: "21:00" }]
    const { gantt } = buildDayParts(new Date("2026-07-04T00:00:00Z"), shifts, shows, false)
    expect(gantt).toContain('<th scope="row" class="show-label-cell">Spectacles</th>')
    expect(gantt).toContain('<span aria-hidden="true">🎪</span> Concert')
  })
})
