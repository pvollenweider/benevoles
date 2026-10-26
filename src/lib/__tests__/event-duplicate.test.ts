import { describe, it, expect } from "vitest"
import {
  copiedShift, dayOffset, DEFAULT_COPY, duplicateOptionsSchema, duplicatePlan, duplicateSummary, leadersChoiceHint, resolveChoices, shiftIsoDate, summaryAnnouncement,
  type DuplicableEvent, type DuplicableShift,
} from "../event-duplicate"

const shift: DuplicableShift & { id: string; eventId: string; status: string } = {
  id: "s1", eventId: "e1", status: "closed",
  roleName: "Bar", label: "Bar soir", description: "Service", date: new Date("2026-07-04T00:00:00Z"),
  startTime: "18:00", endTime: "23:00", capacity: 4, locationDetails: "Cantine", contactName: "Léa", contactPhone: "079 1",
  instructions: "Gilet fourni", latitude: 46.18, longitude: 6.12, displayOrder: 2, internalNotes: "note", minAge: 18, waitlistEnabled: true, requiresApproval: true, colorKey: "amber", maxPerVolunteer: 2, reservedTags: ["sécurité"],
}
const source: DuplicableEvent = {
  title: "Fête", description: "d", location: "Salle", latitude: 46.2, longitude: 6.1, startDate: new Date("2026-07-04T00:00:00Z"), endDate: new Date("2026-07-05T00:00:00Z"),
  publicInstructions: "pi", confirmationMessage: "cm", reminderMessage: "rm", remindersEnabled: false, requirePhone: true, accentColorKey: "teal",
  dayContactName: "Coordination", dayContactPhone: "079 111 11 11",
  cancelDeadlineDays: 2, cancelDeadlineHours: 6,
  showSchedule: [{ name: "Concert", date: "2026-07-04", startTime: "20:00", endTime: "22:00" }],
  shifts: [shift, { ...shift, date: new Date("2026-07-05T00:00:00Z") }],
  pages: [{ slug: "faq", title: "FAQ", content: "x", displayOrder: 0 }],
  leaders: [{ roleName: "Bar", name: "Léa", email: "lea@x.ch" }],
}

// Regression for #356: the copy used to drop minAge, waitlistEnabled and colorKey.
describe("copiedShift", () => {
  it("keeps the minimum age, the waitlist setting and the role color, never the identity or the status", () => {
    const copy = copiedShift(shift) as Record<string, unknown>
    expect(copy).toMatchObject({ minAge: 18, waitlistEnabled: true, requiresApproval: true, colorKey: "amber", maxPerVolunteer: 2, reservedTags: ["sécurité"], status: "open", capacity: 4 })
    expect(copy).not.toHaveProperty("id")
    expect(copy).not.toHaveProperty("eventId")
  })
})

// Duplication with choices (#378).
describe("duplicatePlan", () => {
  it("defaults: everything but the sector leaders, same dates, « (copie) » title", () => {
    const plan = duplicatePlan(source, {})
    expect(plan.copy).toEqual(DEFAULT_COPY)
    expect(plan.offsetDays).toBe(0)
    expect(plan.event).toMatchObject({ registrationsOpen: false, registrationOpensAt: null, registrationClosesAt: null })
    expect(plan.event).toMatchObject({ title: "Fête (copie)", startDate: source.startDate, endDate: source.endDate, requirePhone: true, remindersEnabled: false, confirmationMessage: "cm" })
    // The day-of contact (#560) follows with the settings.
    expect(plan.event).toMatchObject({ dayContactName: "Coordination", dayContactPhone: "079 111 11 11" })
    // The self-cancellation deadline (#946) too.
    expect(plan.event).toMatchObject({ cancelDeadlineDays: 2, cancelDeadlineHours: 6 })
    expect(plan.shifts).toHaveLength(2)
    expect(plan.pages).toEqual(source.pages)
    expect(plan.leaders).toEqual([])
  })

  it("moves every date by the same offset: event, shifts, shows", () => {
    const plan = duplicatePlan(source, { startDate: "2027-07-03" })
    expect(plan.offsetDays).toBe(364)
    expect(plan.event.startDate.toISOString()).toBe("2027-07-03T00:00:00.000Z")
    expect(plan.event.endDate.toISOString()).toBe("2027-07-04T00:00:00.000Z")
    expect(plan.shifts.map((s) => s.date.toISOString().slice(0, 10))).toEqual(["2027-07-03", "2027-07-04"])
    expect(plan.event.showSchedule).toEqual([{ name: "Concert", date: "2027-07-03", startTime: "20:00", endTime: "22:00" }])
  })

  it("honours each choice; settings off resets messages and registration settings", () => {
    const plan = duplicatePlan(source, { title: "Édition 2027", copy: { shifts: false, pages: false, leaders: true, settings: false } })
    expect(plan.event).toMatchObject({ title: "Édition 2027", publicInstructions: null, confirmationMessage: null, reminderMessage: null, remindersEnabled: true, requirePhone: false, showSchedule: [], dayContactName: null, dayContactPhone: null, cancelDeadlineDays: null, cancelDeadlineHours: null })
    expect(plan.event.description).toBe("d") // description and location always follow
    expect(plan.shifts).toEqual([])
    expect(plan.pages).toEqual([])
    expect(plan.leaders).toEqual(source.leaders)
  })

  // Regression for #1010: a leader of a deleted poste got a link to a poste the copy doesn't have.
  it("leaves out the leaders of a deleted poste, with or without the shifts", () => {
    const withOrphan = { ...source, leaders: [...source.leaders, { roleName: "Vestiaire", name: "Noé", email: "noe@x.ch" }], deletedPostes: ["Vestiaire"] }
    expect(duplicatePlan(withOrphan, { copy: { leaders: true } }).leaders).toEqual(source.leaders)
    expect(duplicatePlan(withOrphan, { copy: { leaders: true, shifts: false } }).leaders).toEqual(source.leaders)
  })

  it("offsets are whole days, backwards too", () => {
    expect(dayOffset(new Date("2026-07-04T00:00:00Z"), "2026-07-01")).toBe(-3)
    expect(dayOffset(new Date("2026-07-04T22:00:00Z"), undefined)).toBe(0)
    expect(shiftIsoDate("2026-12-31", 1)).toBe("2027-01-01")
    expect(resolveChoices({ leaders: true })).toEqual({ ...DEFAULT_COPY, leaders: true })
  })

  it("validates the options", () => {
    expect(duplicateOptionsSchema.safeParse({}).success).toBe(true)
    expect(duplicateOptionsSchema.safeParse({ startDate: "03.07.2027" }).success).toBe(false)
    expect(duplicateOptionsSchema.safeParse({ title: " " }).success).toBe(false)
    expect(duplicateOptionsSchema.safeParse({ copy: { shifts: "yes" } }).success).toBe(false)
  })
})

describe("duplicateSummary", () => {
  const counts = { shifts: 12, pages: 2, leaders: 1, hasSettings: true }
  it("says what follows, what doesn't, and how far dates move", () => {
    const lines = duplicateSummary(counts, DEFAULT_COPY, 364)
    expect(lines[0]).toBe("12 créneaux copiés, rouverts et sans inscriptions.")
    expect(lines[1]).toBe("Toutes les dates décalées de +364 jours.")
    expect(lines).toContain("2 pages personnalisées copiées.")
    expect(lines.some((l) => l.startsWith("1 responsable"))).toBe(false)
    expect(lines).toContain("Messages et paramètres d'inscription copiés.")
    expect(lines.at(-1)).toContain("jamais copiés")
  })

  it("empty copy and leaders opt-in", () => {
    const lines = duplicateSummary(counts, { shifts: false, pages: false, leaders: true, settings: false }, -1)
    expect(lines[0]).toBe("Aucun créneau : la copie démarre vide.")
    expect(lines[1]).toBe("Toutes les dates décalées de -1 jour.")
    expect(lines).toContain("1 responsable de secteur repris : chacun reçoit un email avec son lien pour la copie.")
    expect(lines).toContain("Messages et paramètres d'inscription remis à zéro.")
  })


  it("copies the active custom questions with the settings, never their answers (#483)", () => {
    const q = { label: "Taille", type: "single", options: ["S", "M"], required: true, position: 0 }
    const withQ = { ...source, questions: [q] }
    expect(duplicatePlan(withQ, {}).questions).toEqual([{ ...q, id: expect.any(String), roleName: null, minValue: null, maxValue: null, parentId: null, showIfValues: [], displayScope: "event", displayRoleNames: [] }])
    expect(duplicatePlan(withQ, { copy: { settings: false } }).questions).toEqual([])
  })

  it("copies who a question is asked to (#1140), postes by name even without their shifts; a follow-up follows its parent", () => {
    const parent = { id: "p", label: "Bar ?", type: "yesno", options: [], required: true, position: 0, displayScope: "roles", displayRoleNames: ["Bar", "Absent"] }
    const child = { id: "c", label: "Heures", type: "number", options: [], required: false, position: 1, parentId: "p", showIfValues: ["Oui"], displayScope: "event", displayRoleNames: [] }
    const [p, c] = duplicatePlan({ ...source, questions: [parent, child] }, { copy: { shifts: false } }).questions
    expect(p).toMatchObject({ displayScope: "roles", displayRoleNames: ["Bar", "Absent"] })
    expect(c).toMatchObject({ parentId: p.id, displayScope: "event", displayRoleNames: [] })
  })

  it("copies a number question with its type and bounds (#1015)", () => {
    const q = { label: "Combien de personnes ?", type: "number", options: [], required: false, position: 0, minValue: 1, maxValue: 8 }
    expect(duplicatePlan({ ...source, questions: [q] }, {}).questions).toEqual([{ ...q, id: expect.any(String), roleName: null, parentId: null, showIfValues: [], displayScope: "event", displayRoleNames: [] }])
  })

  it("a question's poste follows when the copy has that poste, cleared otherwise (#984, part 3)", () => {
    const role = source.shifts[0].roleName
    const withQ = { ...source, questions: [
      { label: "Repas ?", type: "yesno", options: [], required: false, position: 0, roleName: role },
      { label: "Parking ?", type: "yesno", options: [], required: false, position: 1, roleName: "Poste disparu" },
    ] }
    expect(duplicatePlan(withQ, {}).questions.map((q) => q.roleName)).toEqual([role, null])
    // Without the shifts, the copy has no poste at all.
    expect(duplicatePlan(withQ, { copy: { shifts: false } }).questions.map((q) => q.roleName)).toEqual([null, null])
  })
})

// Recurring permanences (#866): regenerated from their rule, never moved by the day offset.
describe("duplicatePlan with recurring permanences", () => {
  const season: DuplicableEvent = {
    ...source,
    startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-12-31T00:00:00Z"),
    shifts: [
      { ...shift, roleName: "Accueil", label: "Accueil", date: new Date("2026-09-02T00:00:00Z"), startTime: "14:00", endTime: "17:00", capacity: 2, recurrenceId: "r1" },
      { ...shift, roleName: "Accueil", label: "Accueil", date: new Date("2026-09-09T00:00:00Z"), startTime: "14:00", endTime: "17:00", capacity: 2, recurrenceId: "r1" },
      { ...shift, date: new Date("2026-12-12T00:00:00Z") },
    ],
    recurrences: [{
      id: "r1", roleName: "Accueil", label: "Accueil", weekdays: [3], everyWeeks: 1, startTime: "14:00", endTime: "17:00", slotMinutes: 180, breakMinutes: 0, capacity: 2,
      fromDate: new Date("2026-09-02T00:00:00Z"), untilDate: new Date("2026-09-30T00:00:00Z"), holidays: "FR",
    }],
  }

  it("keeps the weekdays when the copy starts a year later, on another weekday", () => {
    // 1 September 2026 is a Tuesday, 1 September 2027 a Wednesday: 365 days later.
    const plan = duplicatePlan(season, { startDate: "2027-09-01" })
    expect(plan.offsetDays).toBe(365)
    expect(plan.shifts).toHaveLength(1)
    expect(plan.shifts[0].date.toISOString().slice(0, 10)).toBe("2027-12-12")
    expect(plan.recurrences).toHaveLength(1)
    const [{ rule, shifts }] = plan.recurrences
    expect(rule).toMatchObject({ weekdays: [3], holidays: "FR", closures: [] })
    expect(rule).not.toHaveProperty("id")
    expect(rule.fromDate.toISOString().slice(0, 10)).toBe("2027-09-02")
    expect(shifts.map((s) => s.date.toISOString().slice(0, 10))).toEqual(["2027-09-08", "2027-09-15", "2027-09-22", "2027-09-29"])
    expect(shifts[0]).toMatchObject({ roleName: "Accueil", locationDetails: "Cantine", status: "open", capacity: 2 })
  })

  it("keeps a cumulable role cumulable (#986), on copied and regenerated shifts", () => {
    const cumulable = { ...season, shifts: season.shifts.map((s) => ({ ...s, overlapAllowed: s.roleName === "Accueil" })) }
    const plan = duplicatePlan(cumulable, { startDate: "2027-09-01" })
    expect(plan.shifts.map((s) => s.overlapAllowed)).toEqual([false])
    expect(plan.recurrences[0].shifts.every((s) => s.overlapAllowed)).toBe(true)
  })

  it("keeps a role assigned by the organisation only (#1145), on copied and regenerated shifts", () => {
    const assigned = { ...season, shifts: season.shifts.map((s) => ({ ...s, assignedOnly: s.roleName === "Accueil" })) }
    const plan = duplicatePlan(assigned, { startDate: "2027-09-01" })
    expect(plan.shifts.map((s) => s.assignedOnly)).toEqual([false])
    expect(plan.recurrences[0].shifts.every((s) => s.assignedOnly)).toBe(true)
  })

  it("copies no permanence when the shifts are not copied", () => {
    expect(duplicatePlan(season, { copy: { shifts: false } }).recurrences).toEqual([])
  })
})

// #1010: leaders of a deleted poste don't follow; the form says so.
describe("leaders of a deleted poste", () => {
  const base = { shifts: 3, pages: 0, hasSettings: false }
  it("hints who follows and who doesn't", () => {
    expect(leadersChoiceHint({ ...base, leaders: 0 })).toBe("Aucun responsable sur l'événement d'origine.")
    expect(leadersChoiceHint({ ...base, leaders: 2 })).toBe("2 responsables : chacun reçoit tout de suite un email avec son lien pour la copie.")
    expect(leadersChoiceHint({ ...base, leaders: 2, leadersLeftOut: 1 })).toBe("2 responsables : chacun reçoit tout de suite un email avec son lien pour la copie. 1 autre, d'un poste aux créneaux tous annulés, n'est pas repris.")
    expect(leadersChoiceHint({ ...base, leaders: 1, leadersLeftOut: 2 })).toBe("1 responsable : chacun reçoit tout de suite un email avec son lien pour la copie. 2 autres, de postes aux créneaux tous annulés, ne sont pas repris.")
    expect(leadersChoiceHint({ ...base, leaders: 0, leadersLeftOut: 1 })).toBe("Aucun responsable repris : 1 responsable, d'un poste aux créneaux tous annulés, n'est pas repris.")
  })

  it("says in the summary that none follows when all are left out", () => {
    const lines = duplicateSummary({ ...base, leaders: 0, leadersLeftOut: 1 }, { ...DEFAULT_COPY, leaders: true }, 0)
    expect(lines).toContain("Aucun responsable de secteur repris : tous les créneaux de leur poste sont annulés.")
    expect(duplicateSummary({ ...base, leaders: 0, leadersLeftOut: 1 }, DEFAULT_COPY, 0).some((l) => l.includes("responsable"))).toBe(false)
  })

  it("announces the leaders' line with the shifts and dates lines", () => {
    const lines = duplicateSummary({ ...base, leaders: 1 }, { shifts: false, pages: false, leaders: true, settings: false }, 0)
    expect(summaryAnnouncement(lines)).toBe("Résumé mis à jour : Aucun créneau : la copie démarre vide. Mêmes dates que l'original. 1 responsable de secteur repris : chacun reçoit un email avec son lien pour la copie.")
    expect(summaryAnnouncement(duplicateSummary({ ...base, leaders: 1 }, DEFAULT_COPY, 0))).toBe("Résumé mis à jour : 3 créneaux copiés, rouverts et sans inscriptions. Mêmes dates que l'original.")
  })
})

// #1169: sector leaders follow in the copy of their sector, never those of an archived sector.
describe("duplicatePlan — sector leaders (#1169)", () => {
  const withSectors: DuplicableEvent = {
    ...source,
    sectorsEnabled: true,
    sectorsAdoptedAt: new Date("2026-06-01"),
    sectors: [{ id: "sec-a", name: "Parking", displayOrder: 0, archivedAt: null }, { id: "sec-old", name: "Accueil", displayOrder: 1, archivedAt: new Date() }],
    leaders: [
      { roleName: "Bar", sectorId: null, name: "Léa", email: "lea@x.ch" },
      { roleName: null, sectorId: "sec-a", name: "Paula", email: "paula@x.ch" },
      { roleName: null, sectorId: "sec-old", name: "Oscar", email: "oscar@x.ch" },
    ],
  }
  let n = 0
  const newId = () => `new-${++n}`

  it("maps a sector leader to the copy of the sector, keeps poste leaders, leaves out an archived sector's", () => {
    n = 0
    const plan = duplicatePlan(withSectors, { copy: { leaders: true } }, newId)
    const parkingCopy = plan.sectors.find((s) => s.name === "Parking")!.id
    expect(plan.leaders).toEqual([
      { roleName: "Bar", name: "Léa", email: "lea@x.ch" },
      { roleName: null, sectorId: parkingCopy, name: "Paula", email: "paula@x.ch" },
    ])
  })

  it("says why leaders are left out when one leads an archived sector", () => {
    expect(leadersChoiceHint({ shifts: 2, pages: 0, leaders: 2, leadersLeftOut: 1, leftOutSectors: 1, hasSettings: true }))
      .toBe("2 responsables : chacun reçoit tout de suite un email avec son lien pour la copie. 1 autre, d'un poste ou d'un secteur qui n'est plus actif, n'est pas repris.")
    // Without sector leaders, the wording of #1010 is unchanged.
    expect(leadersChoiceHint({ shifts: 2, pages: 0, leaders: 0, leadersLeftOut: 1, hasSettings: true }))
      .toBe("Aucun responsable repris : 1 responsable, d'un poste aux créneaux tous annulés, n'est pas repris.")
  })
})
