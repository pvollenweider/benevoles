import { describe, it, expect } from "vitest"
import { existingOverlapRefusal, findOverlap, selectionOverlapRefusal } from "../signup-eligibility"
import { conflictingShiftIds, type SignupShift } from "../public-signup"
import { addConflictMessage, chosenOverlapMessage, overlappingShiftIds, type ShiftRef } from "../registrations-list"
import { mergeConflicts, type MemberMergeInput, type ShiftMeta } from "../member-merge"
import { findCandidates, type EventShiftRef } from "../open-shifts"
import { gapAfter, gapLabel, hasOverlap, recapShifts, type RecapShiftInput } from "../signup-recap"
import { copiedShift } from "../event-duplicate"
import { describeChanges } from "../event-log-narrative"
import { shiftListText, shiftViewState } from "../public-timeline"

// Every place that refuses or flags an overlap applies the rule of shift-overlap.ts (#986): a
// cumulable role (« Assurer les premiers secours ») may overlap any other shift, here « Buvette ».
const DAY = "2026-07-04"

describe("public sign-up, server checks (signup-eligibility)", () => {
  const buvette = { label: "Buvette", date: DAY, startTime: "10:00", endTime: "14:00" }
  const secours = { label: "Secours", date: DAY, startTime: "09:00", endTime: "17:00", overlapAllowed: true }
  const accueil = { label: "Accueil", date: DAY, startTime: "12:00", endTime: "13:00" }

  it("accepts a selection where the overlap involves a cumulable role", () => {
    expect(selectionOverlapRefusal([buvette, secours])).toBeNull()
    expect(selectionOverlapRefusal([secours, buvette])).toBeNull()
  })

  it("still refuses two ordinary overlapping shifts, even next to a cumulable one", () => {
    const refusal = selectionOverlapRefusal([secours, buvette, accueil])
    expect(refusal?.status).toBe(400)
    expect(refusal?.body.error).toContain("Buvette")
    expect(refusal?.body.error).toContain("Accueil")
  })

  it("accepts a cumulable shift over an existing registration, and the other way round", () => {
    expect(findOverlap([{ shift: buvette }], [secours])).toBeNull()
    expect(findOverlap([{ shift: secours }], [buvette])).toBeNull()
    expect(existingOverlapRefusal([{ shift: secours }], [buvette])).toBeNull()
  })

  it("refuses an ordinary overlap with an existing registration", () => {
    expect(findOverlap([{ shift: buvette }], [accueil])).toEqual({ label: "Buvette" })
    expect(existingOverlapRefusal([{ shift: buvette }], [accueil])?.status).toBe(409)
  })
})

describe("public sign-up page (public-signup, public-timeline)", () => {
  const s = (id: string, startTime: string, endTime: string, overlapAllowed = false): SignupShift => ({
    id, label: id, date: DAY, startTime, endTime, status: "open", waitlistEnabled: false, minAge: null, overlapAllowed,
  })
  const shifts = [s("buvette", "10:00", "14:00"), s("secours", "09:00", "17:00", true), s("accueil", "12:00", "13:00")]

  it("keeps a cumulable shift selectable over a selected one", () => {
    expect(conflictingShiftIds(shifts, new Set(["buvette"]), new Set())).toEqual(new Set(["accueil"]))
  })

  it("keeps every shift selectable over a held cumulable one", () => {
    expect(conflictingShiftIds(shifts, new Set(), new Set(["secours"]))).toEqual(new Set())
  })

  it("leaves the shift clickable and without the conflict wording on the timeline and the list", () => {
    const conflicts = conflictingShiftIds(shifts, new Set(["buvette"]), new Set())
    const secours = { ...shifts[1], roleName: "Secours", capacity: 2, registered: 0, spotsLeft: 2, displayOrder: 0, colorKey: null }
    const view = shiftViewState({ shift: secours, held: undefined, selected: false, conflict: conflicts.has("secours"), reserved: false, locked: false })
    expect(view.clickable).toBe(true)
    expect(view.conflict).toBe(false)
    expect(shiftListText(secours, view, { locked: false }).status).not.toMatch(/Chevauche/)
  })
})

describe("manual placement (registrations-list)", () => {
  const ref = (id: string, startTime: string, endTime: string, overlapAllowed?: boolean): ShiftRef => ({
    id, roleName: id, label: id, date: DAY, startTime, endTime, capacity: 2, registrationCount: 0, overlapAllowed,
  })
  const buvette = ref("buvette", "10:00", "14:00")
  const secours = ref("secours", "09:00", "17:00", true)
  const accueil = ref("accueil", "12:00", "13:00")

  it("does not warn about an overlap with a cumulable role", () => {
    expect(addConflictMessage(secours, [buvette])).toBeNull()
    expect(addConflictMessage(buvette, [secours])).toBeNull()
    expect(chosenOverlapMessage(secours, [buvette])).toBeNull()
  })

  it("still warns about an ordinary overlap and an already held shift", () => {
    expect(addConflictMessage(accueil, [buvette])).toMatch(/plage horaire/)
    expect(addConflictMessage(secours, [secours])).toMatch(/déjà inscrit à ce créneau/)
    expect(chosenOverlapMessage(accueil, [buvette])).toMatch(/chevauche/)
  })

  it("marks only the clashing shifts in the picker (the « conflit » mention and its name come from it)", () => {
    expect(overlappingShiftIds([buvette, secours, accueil], [buvette])).toEqual(new Set(["accueil"]))
    expect(overlappingShiftIds([buvette, secours, accueil], [secours])).toEqual(new Set())
  })
})

describe("member merge (member-merge)", () => {
  const meta = (id: string, startTime: string, endTime: string, overlapAllowed?: boolean): ShiftMeta => ({
    id, eventId: "e1", roleName: id, label: id, date: new Date(DAY), startTime, endTime, minAge: null, maxPerVolunteer: null, reservedTags: [], overlapAllowed,
  })
  const input = (shifts: ShiftMeta[]): MemberMergeInput => ({
    keep: { id: "k", firstName: "A", lastName: "B", email: "a@example.org", phone: null, tags: [], notes: null, birthDate: null, availabilityPeriods: [], availabilityNote: null, active: true, createdAt: new Date("2026-01-01"), organizationId: "o", mergedIntoId: null },
    absorb: { id: "x", firstName: "A", lastName: "B", email: "b@example.org", phone: null, tags: [], notes: null, birthDate: null, availabilityPeriods: [], availabilityNote: null, active: true, createdAt: new Date("2026-01-01"), organizationId: "o", mergedIntoId: null },
    shifts,
    keepRegistrations: [{ id: "r1", eventId: "e1", shiftId: shifts[0].id, status: "active", checkedInAt: null }],
    absorbRegistrations: [{ id: "r2", eventId: "e1", shiftId: shifts[1].id, status: "active", checkedInAt: null }],
    keepInvites: [], absorbInvites: [], keepAnswers: [], absorbAnswers: [], absorbPushSubscriptions: [], absorbDeliveryOutcomes: [], sectorLeadersMatchingAbsorbed: [], keepAddressHash: null,
  })

  it("does not report an overlap with a cumulable role", () => {
    expect(mergeConflicts(input([meta("buvette", "10:00", "14:00"), meta("secours", "09:00", "17:00", true)]), {}).filter((c) => c.kind === "overlap")).toEqual([])
  })

  it("still reports an ordinary overlap", () => {
    expect(mergeConflicts(input([meta("buvette", "10:00", "14:00"), meta("accueil", "12:00", "13:00")]), {})).toContainEqual({ kind: "overlap", shiftIds: ["buvette", "accueil"], labels: ["buvette", "accueil"] })
  })
})

describe("open-shifts finder (open-shifts)", () => {
  const ref = (id: string, startTime: string, endTime: string, overlapAllowed?: boolean): EventShiftRef => ({ id, roleName: id, label: id, date: DAY, startTime, endTime, overlapAllowed })
  const buvette = ref("buvette", "10:00", "14:00")
  const secours = ref("secours", "09:00", "17:00", true)
  const accueil = ref("accueil", "12:00", "13:00")
  const members = [{ id: "m", firstName: "M", lastName: "M", hasEmail: true, active: true, tags: [] }]

  it("offers a cumulable shift to a member on an overlapping one", () => {
    const { candidates } = findCandidates({ shifts: [{ ...secours, placesLeft: 1 }], eventShifts: [buvette, secours, accueil], members, registrations: [{ volunteerId: "m", shiftId: "buvette", status: "active" }], invites: [] })
    expect(candidates[0].offer).toEqual(["secours"])
  })

  it("offers any shift to a member on a cumulable one, and keeps marking an ordinary overlap", () => {
    const fromSecours = findCandidates({ shifts: [{ ...accueil, placesLeft: 1 }], eventShifts: [buvette, secours, accueil], members, registrations: [{ volunteerId: "m", shiftId: "secours", status: "active" }], invites: [] })
    expect(fromSecours.candidates[0].offer).toEqual(["accueil"])
    const fromBuvette = findCandidates({ shifts: [{ ...accueil, placesLeft: 1 }], eventShifts: [buvette, secours, accueil], members, registrations: [{ volunteerId: "m", shiftId: "buvette", status: "active" }], invites: [] })
    expect(fromBuvette.candidates[0].fits[0].status).toBe("overlap")
  })
})

describe("sign-up recap (signup-recap)", () => {
  const input = (id: string, startTime: string, endTime: string, overlapAllowed?: boolean): RecapShiftInput => ({
    id, roleName: id, label: id, date: DAY, startTime, endTime, status: "open", waitlistEnabled: false, minAge: null, overlapAllowed,
  })

  it("says an accepted overlap is possible, in neutral words, and raises no warning", () => {
    const rows = recapShifts([input("buvette", "10:00", "14:00"), input("secours", "09:00", "17:00", true)])
    const gap = gapAfter(rows, 0)
    expect(gap).toEqual({ kind: "parallel", minutes: 240 })
    expect(gapLabel(gap!)).toBe("En même temps que le créneau suivant pendant 4 h : c'est possible, l'un des deux postes se cumule avec un autre créneau.")
    expect(hasOverlap(rows)).toBe(false)
  })

  it("keeps the refusal for an ordinary overlap", () => {
    const rows = recapShifts([input("buvette", "10:00", "14:00"), input("accueil", "12:00", "13:00")])
    expect(gapAfter(rows, 0)).toEqual({ kind: "overlap", minutes: 60 })
    expect(hasOverlap(rows)).toBe(true)
  })

  it("finds a refused overlap between shifts that are not neighbours", () => {
    // 09:00 cumulable sits between the two shifts that clash.
    const rows = recapShifts([input("a", "08:00", "14:00"), input("secours", "09:00", "10:00", true), input("b", "12:00", "15:00")])
    expect(rows.map((r) => r.id)).toEqual(["a", "secours", "b"])
    expect(gapAfter(rows, 0)?.kind).toBe("parallel")
    expect(hasOverlap(rows)).toBe(true)
  })
})

describe("event duplication and history", () => {
  it("copies the role's option with the shift", () => {
    const base = {
      roleName: "Secours", label: "Secours", description: null, date: new Date(DAY), startTime: "09:00", endTime: "17:00", capacity: 2, minVolunteers: null,
      locationDetails: null, latitude: null, longitude: null, contactName: null, contactPhone: null, instructions: null, displayOrder: 0, internalNotes: null,
      minAge: null, waitlistEnabled: false, requiresApproval: false, colorKey: null,
    }
    expect(copiedShift({ ...base, overlapAllowed: true }).overlapAllowed).toBe(true)
    expect(copiedShift(base).overlapAllowed).toBe(false)
  })

  it("names the option in the history", () => {
    expect(describeChanges({ overlapAllowed: { from: false, to: true } })).toEqual(["cumulable avec un autre créneau : non → oui"])
  })
})
