import { describe, it, expect } from "vitest"
import { answerSummary } from "../question-answer-summary"
import { EMERGENCY_NOTE } from "../shift-info"
import { ATTENDANCE_SPARE_LINES, emailWithBreaks, ganttOf, isSheetView, mergeTouchingShifts, phoneDays, renderSheet, SHEET_VIEWS, staffingLine, volunteersOf, type SheetData, type SheetShift } from "../print-sheets"

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
  it("says the sector a sheet is limited to (#1170), under the title; nothing otherwise", () => {
    const html = renderSheet("day", { ...data, sectorCaption: "Secteur : Autres postes" })
    expect(html).toContain("<title>Planning par jour – Fête d&#39;été – Secteur : Autres postes</title>".replace("&#39;", "'"))
    expect(html).toContain(`<p class="kind"><strong>Secteur : Autres postes</strong></p>`)
    expect(renderSheet("day", data)).not.toContain("Secteur :")
    // An empty filtered sheet reads as filtered, not broken.
    expect(renderSheet("day", { ...data, shifts: [], sectorCaption: "Secteur : Parking" })).toContain("Aucun créneau dans ce choix (Secteur : Parking).")
  })

  it("knows its six views, volunteers' first", () => {
    expect(SHEET_VIEWS.map((v) => v.id)).toEqual(["day", "role", "individual", "attendance", "phones", "answers"])
    expect(isSheetView("day")).toBe(true)
    expect(isSheetView("badge")).toBe(false)
  })

  it("groups volunteers across shifts, alphabetically, keeping a phone found on any registration", () => {
    const rows = volunteersOf(data.shifts)
    expect(rows.map((r) => `${r.volunteer.lastName}:${r.shifts.length}`)).toEqual(["Durand:1", "Martin:2"])
    expect(rows[1].shifts.map((s) => s.id)).toEqual(["s2", "s1"])
  })

  it("sums staffing for a section head", () => {
    expect(staffingLine(data.shifts.slice(0, 2))).toBe("2 créneaux · <span aria-hidden=\"true\">3/4 inscrits</span><span class=\"sr-only\">3 inscrits sur 4 places</span> · <strong>1 place à pourvoir</strong>")
    expect(staffingLine([shift({ id: "x", capacity: 1, registrations: [alice] })])).toBe("1 créneau · <span aria-hidden=\"true\">1/1 inscrits</span><span class=\"sr-only\">1 inscrit sur 1 place</span> · complet")
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

  it("phones: organizers-only notice, one column per event day and a volunteer row header", () => {
    const html = renderSheet("phones", data)
    expect(html).toContain("Document pour les organisateurs")
    expect(html).toContain('<table class="phones-table">')
    expect(html).toContain('<caption class="sr-only">Bénévoles, coordonnées et créneaux par jour</caption>')
    expect(html).toContain('<th scope="col">Bénévole</th>')
    expect(html).toContain('<th scope="col"><span aria-hidden="true">sam. 4 juil.</span><span class="sr-only">samedi 4 juillet</span></th>')
    expect(html).toContain('<th scope="col"><span aria-hidden="true">dim. 5 juil.</span><span class="sr-only">dimanche 5 juillet</span></th>')
    expect(html).toContain('<th scope="row" class="vol-cell">')
    expect(html).toContain('<span class="vol-name">Martin Alice</span>')
    expect(html).toContain('<span class="vol-phone mono">079 1</span>')
    expect(html).toContain("2 bénévoles.")
    expect(html).toContain("size: A4 landscape")
    expect(html).not.toContain('class="gantt-table"')
    // « Bénévole » plus only the days that have shifts, never an empty day column.
    expect((html.match(/<th scope="col">/g) ?? []).length).toBe(3)
    // Bob has no shift on 5 July: that day cell says so, for sighted and screen-reader users.
    const bobRow = html.split('<span class="vol-name">Durand Bob &lt;B&gt;</span>')[1].split("</tr>")[0]
    expect(bobRow).toContain('<td class="day-cell"><span aria-hidden="true">—</span><span class="sr-only">aucun créneau</span></td>')
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
    expect(html).toContain("Contact pour ce créneau : Léa")
    expect(html).toContain("À savoir : Gilet fourni")
    expect(html).toContain("<h2>Bob &lt;B&gt; Durand</h2>")
    expect((html.match(/class="gantt-table"/g) ?? []).length).toBe(2) // one day each
  })

  // Day-of contact (#560): on the individual sheet for a shift without a contact, the emergency note once per volunteer.
  it("individual: the day-of contact for a shift without contact, with the emergency note once", () => {
    const day = { dayContactName: "Coordination", dayContactPhone: "079 111 11 11" }
    const html = renderSheet("individual", {
      ...data,
      shifts: [
        shift({ id: "a", registrations: [alice], contactName: "Léa" }),
        shift({ id: "b", startTime: "14:00", endTime: "16:00", registrations: [alice], ...day }),
        shift({ id: "c", startTime: "17:00", endTime: "18:00", registrations: [alice], ...day }),
        shift({ id: "d", registrations: [bob], contactName: "Léa" }),
      ],
    })
    // Pages in alphabetical order of last names: Durand (Bob), then Martin (Alice).
    const [, bobPage, alicePage] = html.split("<h2>")
    expect(alicePage).toContain("Alice Martin")
    expect(alicePage).toContain("Contact pour ce créneau : Léa")
    expect(alicePage).toContain("Contact le jour J : Coordination, 079 111 11 11")
    expect(alicePage.split(EMERGENCY_NOTE).length - 1).toBe(1)
    // Inside the first card with the day-of contact, so it is printed with it.
    const firstDayCard = alicePage.split('<div class="card">').find((c) => c.includes("Contact le jour J"))!
    expect(firstDayCard).toContain(`<p class="note">${EMERGENCY_NOTE}</p>`)
    expect(bobPage).not.toContain("urgence")
  })

  it("individual: names the role's sector leaders, without their email (#560)", () => {
    const html = renderSheet("individual", { ...data, shifts: [shift({ id: "a", registrations: [alice], sectorLeaderNames: ["Léa"] })] })
    expect(html).toContain("Responsable du poste : Léa")
    expect(html).not.toContain("lea@x.ch")
  })

  it("says so when the event has no shift", () => {
    expect(renderSheet("day", { ...data, shifts: [] })).toContain("Aucun créneau.")
  })

  it("answers (#686): one captioned table per question, counts only, waitlist column when needed", () => {
    const answers = answerSummary(
      [
        { id: "q1", label: "Taille <t-shirt>", type: "single", options: ["S", "M"], answers: [{ volunteerId: "a", values: ["M"] }, { volunteerId: "w", values: ["S"] }] },
        { id: "q2", label: "Transport", type: "multiple", options: ["Vélo", "Train"], answers: [{ volunteerId: "a", values: ["Vélo", "Train"] }] },
      ],
      [{ volunteerId: "a", status: "active" }, { volunteerId: "b", status: "active" }, { volunteerId: "w", status: "waiting" }],
    )
    const html = renderSheet("answers", { ...data, shifts: [], answers })
    expect(html).not.toContain("Aucun créneau.")
    expect(html).toContain("<strong>2 bénévoles confirmés</strong>, et 1 en attente")
    expect(html).toContain("<caption>Taille &lt;t-shirt&gt;</caption>")
    expect(html).toContain('<th scope="col" class="num">En attente</th>')
    expect(html).toMatch(/<th scope="row">M<\/th>\s*<td class="num mono">1<\/td><td class="num mono">0<\/td>/)
    expect(html).toContain("Plusieurs choix possibles : le total peut dépasser le nombre de bénévoles.")
    expect(html).not.toContain("Alice")
    const noWaitlist = renderSheet("answers", { ...data, answers: { ...answers, waitingCount: 0 } })
    expect(noWaitlist).not.toContain("En attente")
  })

  it("answers (#1015): a number question shows its total, in bold, with its note", () => {
    const answers = answerSummary(
      [{ id: "q3", label: "Combien de personnes ?", type: "number", options: [], answers: [{ volunteerId: "a", values: ["3"] }, { volunteerId: "b", values: ["2"] }] }],
      [{ volunteerId: "a", status: "active" }, { volunteerId: "b", status: "active" }],
    )
    const html = renderSheet("answers", { ...data, shifts: [], answers })
    expect(html).toContain('<caption>Combien de personnes ?<span class="caption-note">Somme des nombres indiqués par les bénévoles confirmés.</span></caption>')
    expect(html).toMatch(/<th scope="row" class="total">Total<\/th>\s*<td class="num mono">5<\/td>/)
    expect(html).toMatch(/<th scope="row">Nombre de réponses<\/th>\s*<td class="num mono">2<\/td>/)
  })

  it("answers: says so when there is no question or no confirmed volunteer", () => {
    expect(renderSheet("answers", { ...data, answers: { confirmedCount: 0, waitingCount: 0, questions: [] } })).toContain("Aucune question posée aux bénévoles")
    const q = { id: "q", label: "Q", type: "text", rows: [] }
    expect(renderSheet("answers", { ...data, answers: { confirmedCount: 0, waitingCount: 2, questions: [q] } })).toContain("Aucun bénévole confirmé pour l'instant. 2 en attente")
  })
})

describe("phone list (#1431)", () => {
  it("keeps only the days that have shifts, chronological, with the short day header", () => {
    expect(phoneDays([
      shift({ id: "a", date: "2026-07-06" }),
      shift({ id: "b", date: "2026-07-04" }),
      shift({ id: "c", date: "2026-07-06" }),
    ])).toEqual([
      { date: "2026-07-04", label: "sam. 4 juil.", full: "samedi 4 juillet" },
      { date: "2026-07-06", label: "lun. 6 juil.", full: "lundi 6 juillet" },
    ])
  })

  it("merges touching shifts of the same role and day into one line", () => {
    expect(mergeTouchingShifts([
      shift({ id: "a", startTime: "10:00", endTime: "12:00" }),
      shift({ id: "b", startTime: "12:00", endTime: "14:00" }),
    ])).toEqual([
      { date: "2026-07-04", startTime: "10:00", endTime: "14:00", roleName: "Bar", label: "Bar" },
    ])
  })

  it("does not merge across roles, a gap, a different label, or days", () => {
    const merged = mergeTouchingShifts([
      shift({ id: "role", roleName: "Bar", label: "Bar", startTime: "10:00", endTime: "12:00" }),
      shift({ id: "other", roleName: "Accueil", label: "Accueil", startTime: "12:00", endTime: "14:00" }),
      shift({ id: "gap", roleName: "Accueil", label: "Accueil", startTime: "15:00", endTime: "17:00" }),
      shift({ id: "label", roleName: "Accueil", label: "Accueil · soir", startTime: "17:00", endTime: "19:00" }),
      shift({ id: "day", roleName: "Accueil", label: "Accueil · soir", date: "2026-07-05", startTime: "19:00", endTime: "21:00" }),
    ])
    expect(merged.map((m) => `${m.date} ${m.roleName} ${m.startTime}-${m.endTime}`)).toEqual([
      "2026-07-04 Bar 10:00-12:00",
      "2026-07-04 Accueil 12:00-14:00",
      "2026-07-04 Accueil 15:00-17:00",
      "2026-07-04 Accueil 17:00-19:00",
      "2026-07-05 Accueil 19:00-21:00",
    ])
  })

  it("keeps chronological order from unsorted input", () => {
    const merged = mergeTouchingShifts([
      shift({ id: "c", roleName: "Cuisine", label: "Cuisine", startTime: "14:00", endTime: "16:00" }),
      shift({ id: "a", roleName: "Accueil", label: "Accueil", startTime: "10:00", endTime: "12:00" }),
      shift({ id: "b", roleName: "Bar", label: "Bar", startTime: "12:00", endTime: "14:00" }),
    ])
    expect(merged.map((m) => m.startTime)).toEqual(["10:00", "12:00", "14:00"])
  })

  it("keeps a shift crossing midnight on its own day", () => {
    expect(mergeTouchingShifts([
      shift({ id: "night", date: "2026-07-04", startTime: "22:00", endTime: "02:00" }),
      shift({ id: "early", date: "2026-07-05", startTime: "02:00", endTime: "04:00" }),
    ])).toEqual([
      { date: "2026-07-04", startTime: "22:00", endTime: "02:00", roleName: "Bar", label: "Bar" },
      { date: "2026-07-05", startTime: "02:00", endTime: "04:00", roleName: "Bar", label: "Bar" },
    ])
  })

  it("renders a merged shift once, as a time column and a role column in a real list", () => {
    const role = "Restauration légère - gardien entrée Gymnase"
    const html = renderSheet("phones", { ...data, shifts: [
      shift({ id: "a", roleName: role, label: role, startTime: "10:00", endTime: "12:00", registrations: [alice] }),
      shift({ id: "b", roleName: role, label: role, startTime: "12:00", endTime: "14:00", registrations: [alice] }),
    ] })
    expect(html).toContain('<ul class="shifts" role="list"><li><span class="shift-time mono">10:00<span aria-hidden="true">–</span><span class="sr-only"> à </span>14:00<span class="sr-only"> : </span></span><span class="shift-role">Restauration légère - gardien entrée Gymnase</span></li></ul>')
    expect((html.match(/Restauration légère - gardien entrée Gymnase/g) ?? []).length).toBe(1)
    // CSS subgrid: the role wraps inside its own column, never back under the time.
    expect(html).toMatch(/\.phones-table \.shifts \{[^}]*display: grid;[^}]*grid-template-columns: max-content minmax\(0, 1fr\)/)
    expect(html).toMatch(/\.phones-table \.shifts li \{[^}]*grid-template-columns: subgrid/)
    expect(html).toMatch(/\.phones-table \.shift-time \{[^}]*white-space: nowrap/)
    expect(html).toMatch(/\.phones-table \.shift-role \{[^}]*overflow-wrap: anywhere/)
  })

  it("marks a shift running past midnight next to its role, so the time column keeps its width", () => {
    const html = renderSheet("phones", { ...data, shifts: [
      shift({ id: "night", startTime: "22:00", endTime: "02:00", registrations: [alice] }),
    ] })
    expect(html).toContain('22:00<span aria-hidden="true">–</span><span class="sr-only"> à </span>02:00<span class="sr-only"> le lendemain</span><span class="sr-only"> : </span></span>')
    expect(html).toContain('<span class="next-day" aria-hidden="true">(fin le lendemain)</span>')
  })

  it("puts the phone on its own line and breaks an email before @ or a dot, never mid-word", () => {
    expect(emailWithBreaks("alice.martin@example.test")).toBe("alice<wbr>.martin<wbr>@example<wbr>.test")
    expect(emailWithBreaks("a&b@x.ch")).toBe("a&amp;b<wbr>@x<wbr>.ch")
    expect(emailWithBreaks(null)).toBe("")

    const html = renderSheet("phones", { ...data, shifts: [
      shift({ id: "a", registrations: [{ ...alice, email: "restauration.gymnase.entree@association-exemple.test" }] }),
    ] })
    expect(html).toContain('<span class="vol-email">restauration<wbr>.gymnase<wbr>.entree<wbr>@association-exemple<wbr>.test</span>')
    expect(html).not.toContain("word-break: break-all")
    expect(html).toMatch(/\.phones-table \.vol-email \{[^}]*word-break: normal;[^}]*overflow-wrap: anywhere/)
    expect(html).toMatch(/\.phones-table \.vol-phone \{[^}]*white-space: nowrap/)
    // The phone and email are normal weight; only the name stays bold.
    expect(html).toContain(".phones-table tbody th { font-weight: 400; }")
    expect(html).toContain(".phones-table .vol-name { display: block; font-weight: 700; }")
  })

  it("keeps rows together, zebra rows and a header repeated across pages", () => {
    const html = renderSheet("phones", data)
    expect(html).toMatch(/\.phones-table tr \{[^}]*page-break-inside: avoid;[^}]*break-inside: avoid/)
    expect(html).toMatch(/\.phones-table tbody tr:nth-child\(even\) th, \.phones-table tbody tr:nth-child\(even\) td \{ background: var\(--band\)/)
    expect(html).toContain(".phones-table thead { display: table-header-group; }")
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

  it("lays the Gantt out over the page width, never wider (#923 regression)", () => {
    const html = renderSheet("day", data)
    expect(html).toMatch(/\.gantt-table \{[^}]*table-layout: fixed;[^}]*width: 100%/)
    expect(html).not.toMatch(/\.slot-th \{[^}]*min-width/)
    expect(html).toContain("<colgroup>")
  })
})
