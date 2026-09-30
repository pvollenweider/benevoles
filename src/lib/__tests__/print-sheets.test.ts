import { describe, it, expect } from "vitest"
import { ATTENDANCE_SPARE_LINES, ganttOf, isSheetView, renderSheet, SHEET_VIEWS, shiftsByDay, staffingLine, volunteersOf, type SheetData, type SheetShift } from "../print-sheets"

const alice = { firstName: "Alice", lastName: "Martin", email: "alice@x.ch", phone: "079 1", comment: null, checkedIn: true }
const bob = { firstName: "Bob <B>", lastName: "Durand", email: null, phone: null, comment: "vient tard", checkedIn: false }
const shift = (over: Partial<SheetShift> & { id: string }): SheetShift => ({
  roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrations: [], ...over,
})
const data: SheetData = {
  eventTitle: "Fête d'été",
  organizationName: "Org",
  printedAt: "04.07.2026 08:00",
  shifts: [
    shift({ id: "s1", registrations: [alice, bob], locationDetails: "Entrée B", contactName: "Léa", instructions: "Gilet fourni" }),
    shift({ id: "s2", roleName: "Accueil", startTime: "09:00", endTime: "11:00", capacity: 1, registrations: [alice] }),
    shift({ id: "s3", date: "2026-07-05", label: "Bar soir", startTime: "18:00", endTime: "20:00", capacity: 2 }),
  ],
  leaders: [{ roleName: "Bar", name: "Léa", email: "lea@x.ch" }],
}

describe("print sheets", () => {
  it("knows its five views, volunteers' first", () => {
    expect(SHEET_VIEWS.map((v) => v.id)).toEqual(["day", "role", "individual", "attendance", "phones"])
    expect(isSheetView("day")).toBe(true)
    expect(isSheetView("badge")).toBe(false)
  })

  it("groups volunteers across shifts, alphabetically, keeping a phone found on any registration", () => {
    const rows = volunteersOf(data.shifts)
    expect(rows.map((r) => `${r.volunteer.lastName}:${r.shifts.length}`)).toEqual(["Durand:1", "Martin:2"])
    expect(rows[1].shifts.map((s) => s.id)).toEqual(["s2", "s1"])
  })

  it("sums staffing for a section head", () => {
    expect(staffingLine(data.shifts.slice(0, 2))).toBe("2 créneaux · 3/4 inscrits · <strong>1 place à pourvoir</strong>")
    expect(staffingLine([shift({ id: "x", capacity: 1, registrations: [alice] })])).toBe("1 créneau · 1/1 inscrits · complet")
  })

  it("builds the export's Gantt for one day, first names in the bars, without its own day title", () => {
    const html = ganttOf(data.shifts.slice(0, 2))
    expect(html).toContain('class="gantt-table"')
    expect(html).toContain("shift-cell")
    expect(html).toContain("Alice")
    expect(html).not.toContain("day-sub-title")
    expect(ganttOf([])).toBe("")
  })

  it("day: per day a Gantt then a detail table, names and free spots, escaped", () => {
    const html = renderSheet("day", data)
    expect(html).toContain("<title>Planning par jour – Fête d'été")
    expect(html).toContain("<h2>Samedi 4 juillet 2026</h2>")
    expect(html).toContain("<h2>Dimanche 5 juillet 2026</h2>")
    expect((html.match(/class="gantt-table"/g) ?? []).length).toBe(2)
    expect(html).toContain("Bob &lt;B&gt; Durand")
    expect(html).toContain("1 place libre")
    expect(html).toContain("2 places libres")
    expect(html).toContain("3/4 inscrits")
    expect(html).toContain("size: A4 landscape")
  })

  it("role: one page per role with its Gantt and leader", () => {
    const html = renderSheet("role", data)
    expect(html).toContain("<h2>Bar</h2>")
    expect(html).toContain("Responsable : <strong>Léa</strong> (lea@x.ch)")
    expect(html).toContain("<h2>Accueil</h2>")
    expect(html).toContain("Pas de responsable de secteur désigné.")
    expect((html.match(/class="block page/g) ?? []).length).toBe(2)
    expect((html.match(/class="gantt-table"/g) ?? []).length).toBe(3) // Bar: two days, Accueil: one
  })

  it("phones: an organizers-only notice, one row per volunteer with their shifts", () => {
    const html = renderSheet("phones", data)
    expect(html).toContain("Ne pas afficher ni distribuer")
    expect(html).toContain('<td class="nowrap mono">079 1</td>')
    expect(html).toContain("2 bénévoles.")
    expect(html).toContain("size: A4 portrait")
    expect(html).not.toContain('class="gantt-table"')
  })

  it("phones: the shifts cell writes each day once, then the hours of every shift of that day", () => {
    const one = data.shifts[0].registrations.slice(0, 1)
    const shifts = [
      { ...data.shifts[0], id: "a", date: "2026-07-05", startTime: "18:00", endTime: "20:00", label: "Bar soir", registrations: one },
      { ...data.shifts[0], id: "b", date: "2026-07-04", startTime: "14:00", endTime: "16:00", registrations: one },
      { ...data.shifts[0], id: "c", date: "2026-07-04", startTime: "10:00", endTime: "12:00", registrations: one },
    ]
    const days = shiftsByDay(shifts)
    expect(days.map((d) => d.day)).toEqual(["sam. 4 juil.", "dim. 5 juil."])
    expect(days[0].items.map((i) => i.time)).toEqual(["10:00–12:00", "14:00–16:00"])
    expect(days[1].items[0]).toEqual({ time: "18:00–20:00", name: "Bar · Bar soir" })
    const html = renderSheet("phones", { ...data, shifts })
    expect(html.match(/sam\. 4 juil\./g)).toHaveLength(1)
    expect(html).toContain('<span class="day">sam. 4 juil.</span>')
  })

  it("attendance: a checkbox per person, already-present people ticked, spare blank lines", () => {
    const html = renderSheet("attendance", data)
    expect(html).toContain("☑")
    const s1 = html.split("<caption>Bar · 10:00–12:00 · 2/3</caption>")[1].split("</table>")[0]
    expect((s1.match(/<tr class="blank">/g) ?? []).length).toBe(1 + ATTENDANCE_SPARE_LINES)
    expect(s1).toContain("vient tard")
  })

  it("individual: one page per volunteer with their day's Gantt, shifts and practical info", () => {
    const html = renderSheet("individual", data)
    expect(html).toContain("<h2>Alice Martin</h2>")
    expect(html).toContain("2 créneaux")
    expect(html).toContain("Lieu : Entrée B")
    expect(html).toContain("Contact : Léa")
    expect(html).toContain("À savoir : Gilet fourni")
    expect(html).toContain("<h2>Bob &lt;B&gt; Durand</h2>")
    expect((html.match(/class="gantt-table"/g) ?? []).length).toBe(2) // one day each
  })

  it("says so when the event has no shift", () => {
    expect(renderSheet("day", { ...data, shifts: [] })).toContain("Aucun créneau.")
  })
})

describe("print sheets use little ink", () => {
  it("draws shift bars as outlined white cells and table headers as bold text, never as ink bands", () => {
    const html = renderSheet("day", data)
    const css = html.split("<style>")[1].split("</style>")[0]
    const rule = (selector: string) => css.split(selector)[1].split("}")[0]
    expect(rule(".gantt-table .shift-cell {")).toContain("background: #fff")
    expect(rule(".gantt-table .shift-cell {")).toContain("border: 2px solid var(--ink)")
    expect(rule(".detail th, .attendance th {")).toContain("background: #fff")
    expect(rule(".gantt-table .th-role, .gantt-table .th-label {")).toContain("background: #fff")
    expect(css).not.toMatch(/(th|shift-cell)[^{]*\{[^}]*background: var\(--ink\)/)
  })
})

describe("volunteersOf identity", () => {
  it("keeps two homonyms without email apart when their ids differ, and merges one person across shifts", () => {
    const a = { id: "v1", firstName: "Léa", lastName: "Roy", email: null, phone: null }
    const b = { id: "v2", firstName: "Léa", lastName: "Roy", email: null, phone: "079 2" }
    const shifts = [
      { ...data.shifts[0], id: "x", registrations: [a, b] },
      { ...data.shifts[0], id: "y", registrations: [{ ...a, phone: "079 1" }] },
    ]
    const people = volunteersOf(shifts)
    expect(people).toHaveLength(2)
    expect(people.find((p) => p.volunteer.id === "v1")!.shifts.map((s) => s.id)).toEqual(["x", "y"])
    expect(people.find((p) => p.volunteer.id === "v1")!.volunteer.phone).toBe("079 1")
    expect(people.find((p) => p.volunteer.id === "v2")!.shifts.map((s) => s.id)).toEqual(["x"])
  })
})
