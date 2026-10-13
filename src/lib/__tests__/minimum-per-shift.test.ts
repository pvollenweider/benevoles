import { describe, it, expect } from "vitest"
import { roleMinimumPlan } from "../shift-quick-edit"
import { timelineBarName, timelineBarPlaces } from "../shifts-admin"
import { attentionItems, type AttentionEvent } from "../attention"
import { eventSummary } from "../event-summary"
import { effectifCell, minimumLegend, type SheetShift } from "../print-sheets"
import { planChange, type RuleShift } from "../shift-recurrence"
import { copiedShift, duplicatedRecurrences, type DuplicableEvent, type DuplicableShift } from "../event-duplicate"
import { templateToEvent, type EventTemplate } from "../event-templates"

// Minimum per shift (#949) wherever a shift's places are shown or copied. Each surface without a
// minimum keeps its existing tests; these are the cases with one.

describe("roleMinimumPlan (« Appliquer à tout le poste »)", () => {
  const shifts = [
    { id: "a", capacity: 4, minVolunteers: null },
    { id: "b", capacity: 4, minVolunteers: 2 },
    { id: "c", capacity: 6, minVolunteers: 3 },
  ]

  it("sets the asked minimum on every shift, skipping those that already have it", () => {
    expect(roleMinimumPlan(shifts, 2)).toEqual({ updates: [{ id: "a", minVolunteers: 2 }, { id: "c", minVolunteers: 2 }], problem: null })
  })

  it("removes it with null, and keeps each shift's own when absent", () => {
    expect(roleMinimumPlan(shifts, null).updates).toEqual([{ id: "b", minVolunteers: null }, { id: "c", minVolunteers: null }])
    expect(roleMinimumPlan(shifts, undefined)).toEqual({ updates: [], problem: null })
  })

  it("refuses, updating nothing, a minimum above a shift's places", () => {
    expect(roleMinimumPlan(shifts, 5)).toEqual({ updates: [], problem: "Sur 2 créneaux du poste, le minimum dépasserait les places : baissez d'abord le minimum." })
    expect(roleMinimumPlan(shifts, 0).problem).toMatch(/au moins 1 personne/)
  })

  it("refuses places under a shift's own minimum until the minimum is lowered", () => {
    const lowered = shifts.map((s) => ({ ...s, capacity: 2 }))
    expect(roleMinimumPlan(lowered, undefined).problem).toBe("Sur 1 créneau du poste, le minimum dépasserait les places : baissez d'abord le minimum.")
    expect(roleMinimumPlan(lowered, 2).problem).toBeNull()
  })
})

describe("Frise bars", () => {
  const bar = { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4 }

  it("show the state against the minimum in place of the free spots", () => {
    expect(timelineBarPlaces({ ...bar, registrationCount: 1, minVolunteers: 2 })).toBe("1/4 inscrit · sous le minimum (2)")
    expect(timelineBarPlaces({ ...bar, registrationCount: 2, minVolunteers: 2 })).toBe("2/4 inscrits · minimum atteint")
    expect(timelineBarPlaces({ ...bar, registrationCount: 4, minVolunteers: 2 })).toBe("4/4 inscrits · Complet")
    expect(timelineBarPlaces({ ...bar, registrationCount: 1, minVolunteers: 2, minAge: 18 })).toBe("18 ans min. · 1/4 inscrit · sous le minimum (2)")
  })

  it("are unchanged without a minimum", () => {
    expect(timelineBarPlaces({ ...bar, registrationCount: 1 })).toBe("1/4 inscrit · 3 libres")
    expect(timelineBarPlaces({ ...bar, registrationCount: 1, minVolunteers: null })).toBe("1/4 inscrit · 3 libres")
  })

  it("say it in words in their name", () => {
    expect(timelineBarName({ ...bar, registrationCount: 1, minVolunteers: 2 }, false)).toBe("Bar, de 10h à 12h, 1 inscrit sur 4, sous le minimum de 2, modifier")
    expect(timelineBarName({ ...bar, registrationCount: 3, minVolunteers: 2 }, false)).toBe("Bar, de 10h à 12h, 3 inscrits sur 4, minimum atteint, modifier")
    expect(timelineBarName({ ...bar, registrationCount: 4, minVolunteers: 2 }, true)).toBe("Bar, de 10h à 12h, 4 inscrits sur 4, complet, modifier")
  })
})

describe("Dashboard « Ce qui demande votre attention »", () => {
  const now = new Date("2030-06-10T10:00:00Z")
  const day = (offset: number) => new Date(Date.UTC(2030, 5, 10 + offset))
  const ev = (shifts: AttentionEvent["shifts"]): AttentionEvent => ({
    id: "e1", title: "Fête", startDate: day(30), endDate: day(31), shifts, leaderRoles: [], overdueMilestones: 0, unansweredInvites: 0,
  })

  it("names the shifts below their minimum and links to « Où manque-t-il du monde ? »", () => {
    const [item] = attentionItems({ now, events: [ev([
      { date: day(1), capacity: 4, active: 1, minVolunteers: 2, roleName: "Bar" },
      { date: day(4), capacity: 4, active: 3, roleName: "Bar" },
    ])], offers: [] })
    expect(item).toMatchObject({ severity: "high", href: "/admin/events/e1/staffing" })
    expect(item.message).toBe("2 créneaux des 7 prochains jours ne sont pas complets, dont 1 sous son minimum (4 places libres).")
  })

  it("isn't urgent when the shifts of the next two days reached their minimum", () => {
    const [item] = attentionItems({ now, events: [ev([{ date: day(1), capacity: 4, active: 2, minVolunteers: 2, roleName: "Bar" }])], offers: [] })
    expect(item).toMatchObject({ severity: "medium", href: "/admin/events/e1/shifts" })
    expect(item.message).toBe("1 créneau des 7 prochains jours n'est pas complet (2 places libres).")
  })
})

describe("Event summary", () => {
  it("lists the shifts left below their minimum", () => {
    const base = { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", waiting: 0, closed: false }
    const s = eventSummary([], new Set(), [
      { ...base, id: "a", capacity: 4, active: 1, minVolunteers: 2 },
      { ...base, id: "b", capacity: 4, active: 2, minVolunteers: 2 },
      { ...base, id: "c", capacity: 4, active: 0 },
    ], [], "Europe/Zurich")
    expect(s.belowMinimum.map((x) => x.id)).toEqual(["a"])
    expect(s.underfilled.map((x) => x.id)).toEqual(["c", "a", "b"])
  })
})

describe("Printed planning", () => {
  const sheet = (over: Partial<SheetShift>): SheetShift => ({
    id: "s", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 4,
    registrations: [{ firstName: "A", lastName: "B", email: null, phone: null }], ...over,
  })

  it("writes the state in the Effectif column, in words for black and white", () => {
    expect(effectifCell(sheet({ minVolunteers: 2 }))).toBe("1/4 · <strong>sous le minimum (2)</strong>")
    expect(effectifCell(sheet({ minVolunteers: 1 }))).toBe("1/4 · minimum atteint")
    expect(effectifCell(sheet({}))).toBe("1/4")
  })

  it("explains the words only when a shift has a minimum", () => {
    expect(minimumLegend([sheet({})])).toBe("")
    expect(minimumLegend([sheet({}), sheet({ minVolunteers: 2 })])).toContain("« Sous le minimum (2) »")
  })
})

describe("Recurring permanence: places changed from a date", () => {
  const rule = { startTime: "14:00", endTime: "17:00", slotMinutes: 180 }
  const shifts: RuleShift[] = [
    { id: "a", date: "2026-09-02", startTime: "14:00", status: "open", committed: 0, hasHistory: false, minVolunteers: 3 },
    { id: "b", date: "2026-09-09", startTime: "14:00", status: "open", committed: 0, hasHistory: false },
  ]

  it("refuses places under a date's minimum, with a message", () => {
    expect(planChange(rule, shifts, "2026-09-01", { capacity: 2 }).problem).toBe("Sur 1 date, le minimum de personnes dépasserait 2 places : baissez d'abord le minimum de ce créneau.")
    expect(planChange(rule, shifts, "2026-09-05", { capacity: 2 }).problem).toBeNull()
    expect(planChange(rule, shifts, "2026-09-01", { capacity: 3 }).problem).toBeNull()
  })
})

describe("Copies carry the minimum", () => {
  const shift: DuplicableShift = {
    roleName: "Accueil", label: "Accueil", description: null, date: new Date("2026-09-02T00:00:00Z"), startTime: "14:00", endTime: "17:00",
    capacity: 4, minVolunteers: 2, locationDetails: null, latitude: null, longitude: null, contactName: null, contactPhone: null, instructions: null,
    displayOrder: 0, internalNotes: null, minAge: null, waitlistEnabled: false, requiresApproval: false, colorKey: null,
  }

  it("event duplication copies it, none stays none", () => {
    expect(copiedShift(shift).minVolunteers).toBe(2)
    expect(copiedShift({ ...shift, minVolunteers: undefined }).minVolunteers).toBeNull()
  })

  it("a regenerated permanence keeps it only if it fits the rule's places", () => {
    const source = (capacity: number): DuplicableEvent => ({
      title: "Saison", description: null, location: null, latitude: null, longitude: null,
      startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-30T00:00:00Z"),
      publicInstructions: null, confirmationMessage: null, reminderMessage: null, remindersEnabled: true, requirePhone: false, accentColorKey: null,
      showSchedule: [], pages: [], leaders: [],
      shifts: [{ ...shift, recurrenceId: "r1" }],
      recurrences: [{ id: "r1", roleName: "Accueil", label: "Accueil", weekdays: [3], everyWeeks: 1, startTime: "14:00", endTime: "17:00", slotMinutes: 180, breakMinutes: 0, capacity, fromDate: new Date("2026-09-02T00:00:00Z"), untilDate: new Date("2026-09-30T00:00:00Z"), holidays: "none" }],
    })
    expect(duplicatedRecurrences(source(4), 0)[0].shifts.every((s) => s.minVolunteers === 2)).toBe(true)
    expect(duplicatedRecurrences(source(1), 0)[0].shifts.every((s) => s.minVolunteers === null)).toBe(true)
  })

  it("a template carries it when it sets one", () => {
    const template: EventTemplate = {
      id: "t", name: "T", description: "", defaultTitle: "T", days: 1,
      shifts: [{ roleName: "Bar", day: 0, startTime: "10:00", endTime: "12:00", capacity: 4, minVolunteers: 2 }, { roleName: "Bar", day: 0, startTime: "12:00", endTime: "14:00", capacity: 4 }],
    }
    const e = templateToEvent(template, { title: "", startDate: "2026-07-04" })
    expect(e.shifts.map((s) => s.minVolunteers)).toEqual([2, undefined])
  })
})
