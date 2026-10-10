import { describe, it, expect } from "vitest"
import {
  copiedShift, dayOffset, DEFAULT_COPY, duplicateOptionsSchema, duplicatePlan, duplicateSummary, resolveChoices, shiftIsoDate,
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
    expect(plan.event).toMatchObject({ title: "Édition 2027", publicInstructions: null, confirmationMessage: null, reminderMessage: null, remindersEnabled: true, requirePhone: false, showSchedule: [], dayContactName: null, dayContactPhone: null })
    expect(plan.event.description).toBe("d") // description and location always follow
    expect(plan.shifts).toEqual([])
    expect(plan.pages).toEqual([])
    expect(plan.leaders).toEqual(source.leaders)
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
    expect(lines).toContain("Messages et réglages d'inscription copiés.")
    expect(lines.at(-1)).toContain("jamais copiés")
  })

  it("empty copy and leaders opt-in", () => {
    const lines = duplicateSummary(counts, { shifts: false, pages: false, leaders: true, settings: false }, -1)
    expect(lines[0]).toBe("Aucun créneau : la copie démarre vide.")
    expect(lines[1]).toBe("Toutes les dates décalées de -1 jour.")
    expect(lines).toContain("1 responsable de secteur repris : chacun reçoit un email avec son lien pour la copie.")
    expect(lines).toContain("Messages et réglages d'inscription remis à zéro.")
  })

  it("copies the active custom questions with the settings, never their answers (#483)", () => {
    const q = { label: "Taille", type: "single", options: ["S", "M"], required: true, position: 0 }
    const withQ = { ...source, questions: [q] }
    expect(duplicatePlan(withQ, {}).questions).toEqual([q])
    expect(duplicatePlan(withQ, { copy: { settings: false } }).questions).toEqual([])
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

  it("copies no permanence when the shifts are not copied", () => {
    expect(duplicatePlan(season, { copy: { shifts: false } }).recurrences).toEqual([])
  })
})
