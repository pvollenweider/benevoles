import { describe, it, expect } from "vitest"
import {
  dayOfBoard,
  dayOfBoardUrl,
  dayOfDateRange,
  filterGroups,
  groupByStart,
  groupHeading,
  isEventDay,
  localDay,
  missingLine,
  presenceAnnouncement,
  PRIMARY_ACTION,
  answerFor,
  attendanceAnnouncement,
  attendanceRequest,
  leftShift,
  leftShiftSentence,
  unchangedAnnouncement,
  conflictAnnouncement,
  personState,
  presenceLine,
  presenceRequest,
  searchAnnouncement,
  shiftCounts,
  shiftHours,
  shiftName,
  shiftPhase,
  telHref,
  type DayOfPerson,
  type DayOfShift,
} from "../day-of"

// « Jour J » (#561).
const TZ = "Europe/Zurich"
const person = (id: string, firstName: string, lastName: string, checkedInAt: string | null = null): DayOfPerson => ({
  registrationId: id, firstName, lastName, phone: null, checkedInAt,
})
const shift = (over: Partial<DayOfShift> & { id: string }): DayOfShift => ({
  roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "13:00", endTime: "16:00", capacity: 3,
  contactName: null, contactPhone: null, people: [], ...over,
})
/** Local wall time in Zurich (summer, UTC+2) as an instant. */
const zurichSummer = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+02:00`)

describe("shiftPhase", () => {
  const now = zurichSummer("2026-07-04", "14:00")

  it("running, starting within 3 hours, over today, later today", () => {
    expect(shiftPhase(shift({ id: "a" }), now, TZ)).toBe("in_progress")
    expect(shiftPhase(shift({ id: "b", startTime: "16:30", endTime: "18:00" }), now, TZ)).toBe("upcoming")
    expect(shiftPhase(shift({ id: "c", startTime: "17:00", endTime: "19:00" }), now, TZ)).toBe("upcoming") // exactly 3 h
    expect(shiftPhase(shift({ id: "d", startTime: "17:01", endTime: "19:00" }), now, TZ)).toBe("later")
    expect(shiftPhase(shift({ id: "e", startTime: "08:00", endTime: "10:00" }), now, TZ)).toBe("earlier")
  })

  it("a shift starting now is running; one ending now is over", () => {
    expect(shiftPhase(shift({ id: "a", startTime: "14:00", endTime: "15:00" }), now, TZ)).toBe("in_progress")
    expect(shiftPhase(shift({ id: "b", startTime: "12:00", endTime: "14:00" }), now, TZ)).toBe("earlier")
  })

  it("other days are left out", () => {
    expect(shiftPhase(shift({ id: "a", date: "2026-07-05", startTime: "08:00", endTime: "10:00" }), now, TZ)).toBeNull()
    expect(shiftPhase(shift({ id: "b", date: "2026-07-03", startTime: "08:00", endTime: "10:00" }), now, TZ)).toBeNull()
  })

  it("a night shift that started yesterday is running after midnight, and over today once it ends", () => {
    const night = shift({ id: "n", date: "2026-07-04", startTime: "22:00", endTime: "04:00" })
    expect(shiftPhase(night, zurichSummer("2026-07-05", "01:30"), TZ)).toBe("in_progress")
    expect(shiftPhase(night, zurichSummer("2026-07-05", "09:00"), TZ)).toBe("earlier")
    // Ended at midnight sharp: that was yesterday's shift.
    const toMidnight = shift({ id: "m", date: "2026-07-03", startTime: "20:00", endTime: "00:00" })
    expect(shiftPhase(toMidnight, now, TZ)).toBeNull()
  })

  it("the window runs past midnight into tomorrow's first shifts", () => {
    const early = shift({ id: "e", date: "2026-07-05", startTime: "01:00", endTime: "05:00" })
    expect(shiftPhase(early, zurichSummer("2026-07-04", "23:00"), TZ)).toBe("upcoming")
  })

  it("uses the organization's zone, not the server's", () => {
    // 12:00 UTC is 14:00 in Zurich but 08:00 in New York.
    const s = shift({ id: "a", startTime: "13:00", endTime: "16:00" })
    expect(shiftPhase(s, new Date("2026-07-04T12:00:00Z"), TZ)).toBe("in_progress")
    expect(shiftPhase(s, new Date("2026-07-04T12:00:00Z"), "America/New_York")).toBe("later")
  })

  it("spring-forward night (29 March 2026): real hours, not wall-clock hours", () => {
    const night = shift({ id: "n", date: "2026-03-28", startTime: "22:00", endTime: "06:00" })
    // 05:30 CEST is 03:30 UTC: still running; 06:30 CEST: over.
    expect(shiftPhase(night, new Date("2026-03-29T03:30:00Z"), TZ)).toBe("in_progress")
    expect(shiftPhase(night, new Date("2026-03-29T04:30:00Z"), TZ)).toBe("earlier")
    // At 01:30 CET, 05:00 CEST is 2 h 30 away in real time (3 h 30 on the clock): within the window.
    const morning = shift({ id: "m", date: "2026-03-29", startTime: "05:00", endTime: "08:00" })
    expect(shiftPhase(morning, new Date("2026-03-29T00:30:00Z"), TZ)).toBe("upcoming")
  })

  it("fall-back night (25 October 2026): the repeated hour counts", () => {
    const now = new Date("2026-10-25T00:30:00Z") // 02:30 CEST, the first one
    // 04:00 CET is 03:00 UTC: 2 h 30 away. 05:00 CET is 3 h 30 away.
    expect(shiftPhase(shift({ id: "a", date: "2026-10-25", startTime: "04:00", endTime: "06:00" }), now, TZ)).toBe("upcoming")
    expect(shiftPhase(shift({ id: "b", date: "2026-10-25", startTime: "05:00", endTime: "07:00" }), now, TZ)).toBe("later")
  })
})

describe("isEventDay and the dates to load", () => {
  const event = { startDate: "2026-07-04T00:00:00.000Z", endDate: "2026-07-06T00:00:00.000Z" }

  it("every day of a multi-day event, in the organization's zone", () => {
    expect(isEventDay(event, zurichSummer("2026-07-04", "08:00"), TZ)).toBe(true)
    expect(isEventDay(event, zurichSummer("2026-07-05", "12:00"), TZ)).toBe(true)
    expect(isEventDay(event, zurichSummer("2026-07-06", "23:30"), TZ)).toBe(true)
    expect(isEventDay(event, zurichSummer("2026-07-07", "00:30"), TZ)).toBe(false)
    // 22:30 UTC on 3 July is already 4 July in Zurich.
    expect(isEventDay(event, new Date("2026-07-03T22:30:00Z"), TZ)).toBe(true)
    expect(isEventDay(event, new Date("2026-07-03T21:30:00Z"), TZ)).toBe(false)
  })

  it("localDay", () => {
    expect(localDay(new Date("2026-07-03T22:30:00Z"), TZ)).toBe("2026-07-04")
  })

  it("loads two days around today, enough for yesterday's night shifts and tomorrow's early ones", () => {
    const r = dayOfDateRange(new Date("2026-07-04T23:30:00Z"))
    expect(r.from.toISOString()).toBe("2026-07-02T00:00:00.000Z")
    expect(r.to.toISOString()).toBe("2026-07-06T00:00:00.000Z")
  })
})

describe("dayOfBoard", () => {
  it("on the second day of a multi-day event, only today's shifts and last night's", () => {
    const shifts = [
      shift({ id: "d1", date: "2026-07-04", startTime: "10:00", endTime: "12:00" }),
      shift({ id: "d1-night", date: "2026-07-04", startTime: "23:00", endTime: "03:00" }),
      shift({ id: "d2-morning", date: "2026-07-05", startTime: "08:00", endTime: "12:00" }),
      shift({ id: "d2-now", date: "2026-07-05", startTime: "13:00", endTime: "16:00" }),
      shift({ id: "d2-next", date: "2026-07-05", startTime: "16:00", endTime: "18:00" }),
      shift({ id: "d2-evening", date: "2026-07-05", startTime: "20:00", endTime: "23:00" }),
      shift({ id: "d3", date: "2026-07-06", startTime: "13:00", endTime: "16:00" }),
    ]
    const b = dayOfBoard(shifts, zurichSummer("2026-07-05", "14:00"), TZ)
    const ids = (gs: typeof b.inProgress) => gs.flatMap((g) => g.shifts.map((s) => s.id))
    expect(ids(b.inProgress)).toEqual(["d2-now"])
    expect(ids(b.upcoming)).toEqual(["d2-next"])
    expect(ids(b.earlier)).toEqual(["d1-night", "d2-morning"])
    expect(b.laterCount).toBe(1)
  })
})

describe("groupByStart", () => {
  it("groups by start time, earliest first, then by role order", () => {
    const groups = groupByStart([
      shift({ id: "bar16", startTime: "16:00", displayOrder: 1 }),
      shift({ id: "caisse14", roleName: "Caisse", label: "Caisse", startTime: "14:00", displayOrder: 2 }),
      shift({ id: "accueil14", roleName: "Accueil", label: "Accueil", startTime: "14:00", displayOrder: 0 }),
      shift({ id: "bar14", startTime: "14:00", displayOrder: 1 }),
      shift({ id: "night", date: "2026-07-03", startTime: "22:00", endTime: "02:00" }),
    ])
    expect(groups.map((g) => [g.key, g.shifts.map((s) => s.id)])).toEqual([
      ["2026-07-03T22:00", ["night"]],
      ["2026-07-04T14:00", ["accueil14", "bar14", "caisse14"]],
      ["2026-07-04T16:00", ["bar16"]],
    ])
  })

  it("names a group by its start, with « hier » or « demain » when it isn't today", () => {
    expect(groupHeading({ date: "2026-07-04", startTime: "14:00" }, "in_progress", "2026-07-04")).toBe("Depuis 14h")
    expect(groupHeading({ date: "2026-07-03", startTime: "22:00" }, "in_progress", "2026-07-04")).toBe("Depuis hier 22h")
    expect(groupHeading({ date: "2026-07-04", startTime: "16:30" }, "upcoming", "2026-07-04")).toBe("À 16h30")
    expect(groupHeading({ date: "2026-07-05", startTime: "01:00" }, "upcoming", "2026-07-04")).toBe("Demain à 1h")
    expect(groupHeading({ date: "2026-07-04", startTime: "08:00" }, "earlier", "2026-07-04")).toBe("Commencé à 8h")
    expect(groupHeading({ date: "2026-07-03", startTime: "22:00" }, "earlier", "2026-07-04")).toBe("Commencé hier à 22h")
  })
})

describe("filterGroups (search)", () => {
  const groups = groupByStart([
    shift({ id: "bar", people: [person("r1", "Zoé", "Müller"), person("r2", "Léon", "Favre")] }),
    shift({ id: "buvette", roleName: "Buvette", label: "Soir", people: [person("r3", "Anne", "Roy")] }),
    shift({ id: "accueil", roleName: "Accueil", label: "Accueil", startTime: "15:00", people: [person("r4", "François", "Zoller")] }),
  ])
  const shown = (q: string) => filterGroups(groups, q).flatMap((g) => g.shifts.map((s) => [s.id, s.people.map((p) => p.registrationId)]))

  it("an empty search keeps everything", () => {
    expect(filterGroups(groups, "  ")).toBe(groups)
  })

  it("finds people by name, accents and case aside, and keeps only them", () => {
    expect(shown("zoe")).toEqual([["bar", ["r1"]]])
    expect(shown("MULLER")).toEqual([["bar", ["r1"]]])
    expect(shown("francois")).toEqual([["accueil", ["r4"]]])
    expect(shown("zo")).toEqual([["bar", ["r1"]], ["accueil", ["r4"]]])
  })

  it("a shift found by its role or label keeps everyone on it", () => {
    expect(shown("buvette")).toEqual([["buvette", ["r3"]]])
    expect(shown("soir")).toEqual([["buvette", ["r3"]]])
  })

  it("nothing found: no group left", () => {
    expect(filterGroups(groups, "xyz")).toEqual([])
    expect(searchAnnouncement([])).toBe("Aucun résultat.")
  })

  it("announces the shifts and people left", () => {
    expect(searchAnnouncement(filterGroups(groups, "zo"))).toBe("2 créneaux, 2 personnes affichées.")
    expect(searchAnnouncement(filterGroups(groups, "buvette"))).toBe("1 créneau, 1 personne affichée.")
  })
})

describe("counts and copy", () => {
  const s = shift({ id: "a", capacity: 4, people: [person("r1", "A", "A", "2026-07-04T12:00:00Z"), person("r2", "B", "B")] })
  const counts = shiftCounts(s, personState)

  it("expected, present and missing places", () => {
    expect(counts).toEqual({ expected: 2, present: 1, absent: 0, leftEarly: 0, missing: 2 })
    expect(presenceLine(counts)).toBe("1 présent sur 2 attendus")
    expect(missingLine(counts)).toBe("Il manque 2 personnes.")
    expect(missingLine({ expected: 4, present: 0, absent: 0, leftEarly: 0, missing: 0 })).toBeNull()
    expect(presenceLine({ expected: 0, present: 0, absent: 0, leftEarly: 0, missing: 3 })).toBe("Personne d'inscrit")
    // Over capacity (added by hand): nothing missing, never negative.
    expect(shiftCounts({ capacity: 1, people: s.people }, () => "expected").missing).toBe(0)
  })

  it("counts recorded absences and names them on the card only when there are any (#1141)", () => {
    const people = [
      person("r1", "Léa", "Morel", "2026-07-04T12:00:00Z"),
      person("r2", "Hugo", "Blanc", "2026-07-04T12:01:00Z"),
      { ...person("r3", "Inès", "Roux"), attendanceStatus: "absent" },
      person("r4", "Noah", "Girard"),
    ]
    const c = shiftCounts({ capacity: 5, people }, personState)
    // Absent people stay among the expected: the place is theirs, nobody else is missing for it.
    expect(c).toEqual({ expected: 4, present: 2, absent: 1, leftEarly: 0, missing: 1 })
    expect(presenceLine(c)).toBe("2 présents sur 4 attendus, 1 absent")
    expect(presenceLine({ ...c, absent: 2 })).toBe("2 présents sur 4 attendus, 2 absents")
    expect(presenceLine({ ...c, absent: 0 })).toBe("2 présents sur 4 attendus")
    // The board applies the marks made on this phone through `stateOf`.
    expect(shiftCounts({ capacity: 5, people }, (p) => (p.registrationId === "r4" ? "absent" : personState(p))).absent).toBe(2)
  })

  it("a person with both a check-in and « absent » (rolling deployment) counts as present, not absent", () => {
    const mixed = { ...person("r1", "Léa", "Morel", "2026-07-04T12:00:00Z"), attendanceStatus: "absent" }
    expect(personState(mixed)).toBe("present")
    expect(shiftCounts({ capacity: 2, people: [mixed, person("r2", "Hugo", "Blanc")] }, personState)).toEqual({ expected: 2, present: 1, absent: 0, leftEarly: 0, missing: 0 })
  })

  it("counts the people gone before the end apart: they are not among the présents (#1141)", () => {
    const people = [
      person("r1", "Léa", "Morel", "2026-07-04T12:00:00Z"),
      { ...person("r2", "Hugo", "Blanc", "2026-07-04T12:01:00Z"), attendanceStatus: "left_early" },
      { ...person("r3", "Inès", "Roux"), attendanceStatus: "absent" },
      person("r4", "Noah", "Girard"),
    ]
    const c = shiftCounts({ capacity: 4, people }, personState)
    expect(c).toEqual({ expected: 4, present: 1, absent: 1, leftEarly: 1, missing: 0 })
    expect(presenceLine(c)).toBe("1 présent sur 4 attendus, 1 absent, 1 parti avant la fin")
    expect(presenceLine({ ...c, absent: 0, leftEarly: 2 })).toBe("1 présent sur 4 attendus, 2 partis avant la fin")
    // The board applies the marks made on this phone through `stateOf`.
    expect(shiftCounts({ capacity: 4, people }, (p) => (p.registrationId === "r4" ? "left_early" : personState(p))).leftEarly).toBe(2)
  })

  it("the row's first button: what a press does from each state (#1141)", () => {
    expect(PRIMARY_ACTION.expected).toEqual({ transition: "check_in", label: "Marquer présent" })
    expect(PRIMARY_ACTION.present).toEqual({ transition: "undo_check_in", label: "Annuler la présence" })
    expect(PRIMARY_ACTION.absent).toEqual({ transition: "undo_absent", label: "Annuler l'absence" })
    expect(PRIMARY_ACTION.left_early).toEqual({ transition: "undo_left_early", label: "Annuler le départ" })
  })

  it("names and hours without « · », a night shift ending the next day", () => {
    expect(shiftName({ roleName: "Bar", label: "Bar" })).toBe("Bar")
    expect(shiftName({ roleName: "Bar", label: "Soir" })).toBe("Bar, Soir")
    expect(shiftHours({ startTime: "14:00", endTime: "18:30" })).toBe("de 14h à 18h30")
    expect(shiftHours({ startTime: "22:00", endTime: "02:00" })).toBe("de 22h à 2h le lendemain")
  })

  it("announces the new state and where the shift stands", () => {
    expect(presenceAnnouncement("Zoé Müller", true, "Bar, Soir", { expected: 4, present: 3, absent: 0, leftEarly: 0, missing: 0 }))
      .toBe("Présence enregistrée pour Zoé Müller. Bar, Soir : 3 présents sur 4 attendus.")
    expect(presenceAnnouncement("Zoé Müller", false, "Bar", { expected: 1, present: 0, absent: 0, leftEarly: 0, missing: 0 }))
      .toBe("Présence annulée pour Zoé Müller. Bar : 0 présent sur 1 attendu.")
  })

  it("announces an absence recorded or undone, with the shift's counts (#1141)", () => {
    expect(attendanceAnnouncement("Inès Roux", "mark_absent", "Bar", { expected: 4, present: 2, absent: 1, leftEarly: 0, missing: 0 }))
      .toBe("Absence enregistrée pour Inès Roux. Bar : 2 présents sur 4 attendus, 1 absent.")
    expect(attendanceAnnouncement("Inès Roux", "undo_absent", "Bar", { expected: 4, present: 2, absent: 0, leftEarly: 0, missing: 0 }))
      .toBe("Absence annulée pour Inès Roux. Bar : 2 présents sur 4 attendus.")
    expect(attendanceAnnouncement("Inès Roux", "check_in", "Bar", { expected: 4, present: 3, absent: 0, leftEarly: 0, missing: 0 }))
      .toBe("Présence enregistrée pour Inès Roux. Bar : 3 présents sur 4 attendus.")
  })

  it("announces a departure and its undo, saying that the presence is restored (#1141)", () => {
    expect(attendanceAnnouncement("Léa Morel", "mark_left_early", "Bar", { expected: 4, present: 1, absent: 0, leftEarly: 1, missing: 0 }))
      .toBe("Départ enregistré pour Léa Morel. Bar : 1 présent sur 4 attendus, 1 parti avant la fin.")
    expect(attendanceAnnouncement("Léa Morel", "undo_left_early", "Bar", { expected: 4, present: 2, absent: 0, leftEarly: 0, missing: 0 }))
      .toBe("Départ annulé pour Léa Morel : présence rétablie. Bar : 2 présents sur 4 attendus.")
  })

  it("says what another device recorded first, without a gendered participle (#1141)", () => {
    const c = { expected: 4, present: 2, absent: 1, leftEarly: 0, missing: 0 }
    expect(conflictAnnouncement("Inès Roux", "absent", "Bar", c))
      .toBe("Une absence est déjà enregistrée pour Inès Roux, depuis un autre appareil. Bar : 2 présents sur 4 attendus, 1 absent.")
    expect(conflictAnnouncement("Inès Roux", "present", "Bar", { ...c, absent: 0 }))
      .toBe("Une présence est déjà enregistrée pour Inès Roux, depuis un autre appareil. Bar : 2 présents sur 4 attendus.")
    // Back to expected elsewhere: nothing recorded to name, the caller keeps its plain sentence.
    expect(conflictAnnouncement("Inès Roux", "expected", "Bar", c)).toBeNull()
    expect(conflictAnnouncement("Léa Morel", "left_early", "Bar", { ...c, absent: 0, leftEarly: 1 }))
      .toBe("Un départ est déjà enregistré pour Léa Morel, depuis un autre appareil. Bar : 2 présents sur 4 attendus, 1 parti avant la fin.")
  })

  it("tel: links keep digits and the leading +", () => {
    expect(telHref("+41 79 123 45 67")).toBe("tel:+41791234567")
    expect(telHref("079 / 123.45.67")).toBe("tel:0791234567")
  })
})

describe("the route's answer about one registration (#1141)", () => {
  const c = { expected: 4, present: 2, absent: 1, leftEarly: 0, missing: 0 }

  it("reads the registration's own entry, and nothing from a previous release or an odd shape", () => {
    const results = [
      { id: "r1", changed: false, state: "absent", checkedInAt: null },
      { id: "r2", changed: true, state: "present", checkedInAt: "2026-07-04T12:03:00.000Z" },
    ]
    expect(answerFor(results, "r1")).toEqual({ id: "r1", changed: false, state: "absent", checkedInAt: null, moved: false })
    expect(answerFor(results, "r2")).toMatchObject({ changed: true, state: "present", checkedInAt: "2026-07-04T12:03:00.000Z" })
    expect(answerFor(results, "r3")).toBeNull()
    expect(answerFor(undefined, "r1")).toBeNull()
    // Since the second PR of #1141, left_early is a state the route may answer.
    expect(answerFor([{ id: "r1", changed: true, state: "left_early", checkedInAt: "2026-07-04T12:03:00.000Z" }], "r1")).toEqual({ id: "r1", changed: true, state: "left_early", checkedInAt: "2026-07-04T12:03:00.000Z", moved: false })
    expect(answerFor([{ id: "r1", changed: false, state: "gone", checkedInAt: null }, null, "x"], "r1")).toBeNull()
  })

  it("moved: on another shift than the one the press was meant for", () => {
    const moved = answerFor([{ id: "r1", changed: false, state: "expected", checkedInAt: null, moved: true }], "r1")
    expect(moved).toMatchObject({ moved: true, state: "expected" })
    expect(leftShift(moved)).toBe(true)
    expect(unchangedAnnouncement("Zoé Müller", moved, "Bar, Soir", c)).toBe("Zoé Müller ne figure plus parmi les personnes attendues, Bar, Soir.")
  })

  it("gone: no longer there at all, with no state", () => {
    const gone = answerFor([{ id: "r1", changed: false, state: null, checkedInAt: null, gone: true }], "r1")
    expect(gone).toEqual({ id: "r1", changed: false, state: null, checkedInAt: null, gone: true })
    expect(leftShift(gone)).toBe(true)
    expect(unchangedAnnouncement("Zoé Müller", gone, "Bar, Soir", c)).toBe(leftShiftSentence("Zoé Müller", "Bar, Soir"))
  })

  it("still on the shift: the sentence of what was recorded elsewhere, or « Rien n'a changé »", () => {
    const absent = answerFor([{ id: "r1", changed: false, state: "absent", checkedInAt: null }], "r1")
    expect(leftShift(absent)).toBe(false)
    expect(leftShift(null)).toBe(false)
    expect(unchangedAnnouncement("Zoé Müller", absent, "Bar", c)).toBe("Une absence est déjà enregistrée pour Zoé Müller, depuis un autre appareil. Bar : 2 présents sur 4 attendus, 1 absent.")
    const expected = answerFor([{ id: "r1", changed: false, state: "expected", checkedInAt: null }], "r1")
    expect(unchangedAnnouncement("Zoé Müller", expected, "Bar", c)).toBe("Rien n'a changé pour Zoé Müller : la liste est mise à jour.")
    // A previous release answers without `results`.
    expect(unchangedAnnouncement("Zoé Müller", null, "Bar", c)).toBe("Rien n'a changé pour Zoé Müller : la liste est mise à jour.")
  })
})

describe("attendanceRequest", () => {
  it("says which shift the row was shown on, when given (#1141)", () => {
    expect(attendanceRequest("evt-1", "r1", "mark_absent", "s1").body).toEqual({ action: "mark_absent", registrationIds: ["r1"], observedShifts: { r1: "s1" } })
    expect(attendanceRequest("evt-1", "r1", "mark_absent").body).not.toHaveProperty("observedShifts")
  })

  it("sends each of the six actions to the registrations list's route, for one registration (#1141)", () => {
    for (const action of ["check_in", "undo_check_in", "mark_absent", "undo_absent", "mark_left_early", "undo_left_early"] as const) {
      expect(attendanceRequest("evt-1", "r1", action)).toEqual({
        url: "/api/admin/events/evt-1/registrations/bulk",
        body: { action, registrationIds: ["r1"] },
      })
    }
  })
})

describe("presenceRequest", () => {
  it("is the registrations list's check-in: same route, same actions, one registration", () => {
    expect(presenceRequest("evt-1", "r1", true)).toEqual({
      url: "/api/admin/events/evt-1/registrations/bulk",
      body: { action: "check_in", registrationIds: ["r1"] },
    })
    expect(presenceRequest("evt-1", "r1", false).body).toEqual({ action: "undo_check_in", registrationIds: ["r1"] })
  })
})

describe("dayOfBoardUrl (#1170)", () => {
  it("reads the whole board without a sector, and keeps the page's sector otherwise", () => {
    expect(dayOfBoardUrl("evt-1")).toBe("/api/admin/events/evt-1/day-of")
    expect(dayOfBoardUrl("evt-1", "")).toBe("/api/admin/events/evt-1/day-of")
    expect(dayOfBoardUrl("evt 1", "autres")).toBe("/api/admin/events/evt%201/day-of?secteur=autres")
  })
})
