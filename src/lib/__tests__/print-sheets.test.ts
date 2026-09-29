import { describe, it, expect } from "vitest"
import { ATTENDANCE_SPARE_LINES, isSheetView, renderSheet, SHEET_VIEWS, volunteersOf, type SheetData, type SheetShift } from "../print-sheets"

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
  it("knows its five views", () => {
    expect(SHEET_VIEWS.map((v) => v.id)).toEqual(["day", "role", "phones", "attendance", "individual"])
    expect(isSheetView("day")).toBe(true)
    expect(isSheetView("badge")).toBe(false)
  })

  it("groups volunteers across shifts, alphabetically, keeping a phone found on any registration", () => {
    const rows = volunteersOf(data.shifts)
    expect(rows.map((r) => `${r.volunteer.lastName}:${r.shifts.length}`)).toEqual(["Durand:1", "Martin:2"])
    expect(rows[1].shifts.map((s) => s.id)).toEqual(["s2", "s1"])
  })

  it("day: one table per day, names and free spots, escaped", () => {
    const html = renderSheet("day", data)
    expect(html).toContain("<title>Planning par jour – Fête d&#39;été".replace("&#39;", "'"))
    expect(html).toContain("samedi 4 juillet 2026")
    expect(html).toContain("dimanche 5 juillet 2026")
    expect(html).toContain("Bob &lt;B&gt; Durand")
    expect(html).toContain("1 place libre")
    expect(html).toContain("2 places libres")
    expect(html).toContain("size: A4 landscape")
  })

  it("role: one page per role with its leader", () => {
    const html = renderSheet("role", data)
    expect(html).toContain("<h2>Bar</h2>")
    expect(html).toContain("Responsable : Léa (lea@x.ch)")
    expect(html).toContain("<h2>Accueil</h2>")
    expect(html).toContain("Pas de responsable de secteur désigné.")
    expect((html.match(/class="block page"/g) ?? []).length).toBe(2)
  })

  it("phones: an organizers-only notice, one row per volunteer with their shifts", () => {
    const html = renderSheet("phones", data)
    expect(html).toContain("Ne pas afficher ni distribuer")
    expect(html).toContain("<td class=\"nowrap\">079 1</td>")
    expect(html).toContain("2 bénévoles.")
    expect(html).toContain("size: A4 portrait")
  })

  it("attendance: a checkbox per person, already-present people ticked, spare blank lines", () => {
    const html = renderSheet("attendance", data)
    expect(html).toContain("☑")
    const s1 = html.split("<caption>Bar · 10:00–12:00 · 2/3</caption>")[1].split("</table>")[0]
    expect((s1.match(/<tr class="blank">/g) ?? []).length).toBe(1 + ATTENDANCE_SPARE_LINES)
    expect(s1).toContain("vient tard")
  })

  it("individual: one page per volunteer with their shifts and the practical info", () => {
    const html = renderSheet("individual", data)
    expect(html).toContain("<h2>Alice Martin</h2>")
    expect(html).toContain("2 créneaux")
    expect(html).toContain("Lieu : Entrée B")
    expect(html).toContain("Contact : Léa")
    expect(html).toContain("À savoir : Gilet fourni")
    expect(html).toContain("<h2>Bob &lt;B&gt; Durand</h2>")
  })

  it("says so when the event has no shift", () => {
    expect(renderSheet("day", { ...data, shifts: [] })).toContain("Aucun créneau.")
  })
})
