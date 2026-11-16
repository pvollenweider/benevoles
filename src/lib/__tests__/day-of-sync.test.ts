import { describe, it, expect } from "vitest"
import {
  DAY_OF_POLL_MAX_MS,
  DAY_OF_POLL_MS,
  NO_CHANGES,
  SETTLE_MS,
  addChanges,
  answerMark,
  boardChanges,
  changedShownRows,
  changesAnnouncement,
  findOnBoard,
  isFreshAnswer,
  leftBoardAnnouncement,
  marksAfterPoll,
  mayAnnounceChanges,
  nextPollDelay,
  noticeStillHolds,
  pinMark,
  releasePin,
  shouldSyncOnResume,
  shownAttendance,
  shownCheckIn,
  shownState,
  shownStatus,
  statusAnnouncement,
  syncStatusOf,
  syncStatusText,
  type LocalMarks,
} from "../day-of-sync"
import type { DayOfBoard, DayOfPerson, DayOfShift } from "../day-of"

// « Jour J » refreshes itself while open (#1141).
const person = (id: string, checkedInAt: string | null = null): DayOfPerson => ({ registrationId: id, firstName: "Zoé", lastName: id, phone: null, checkedInAt })
const absentPerson = (id: string): DayOfPerson => ({ ...person(id), attendanceStatus: "absent" })
const leftEarlyPerson = (id: string): DayOfPerson => ({ ...person(id, "x"), attendanceStatus: "left_early" })
/** A mark of this phone: present at `checkedInAt`, expected when null. */
const mark = (checkedInAt: string | null, at: number | null) => ({ state: checkedInAt ? "present" as const : "expected" as const, checkedInAt, at })
const shift = (id: string, people: DayOfPerson[]): DayOfShift => ({
  id, roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "13:00", endTime: "16:00", capacity: 3, contactName: null, contactPhone: null, people,
})
const boardOf = (people: DayOfPerson[], phase: "inProgress" | "upcoming" | "earlier" = "inProgress"): DayOfBoard => {
  const groups = [{ key: "2026-07-04T13:00", date: "2026-07-04", startTime: "13:00", shifts: [shift("s1", people)] }]
  return { inProgress: [], upcoming: [], earlier: [], laterCount: 0, [phase]: groups }
}

describe("nextPollDelay", () => {
  const base = { visible: true, online: true, status: "ok" as const, failures: 0 }
  it("polls every 25 s while visible and online", () => {
    expect(nextPollDelay(base)).toBe(DAY_OF_POLL_MS)
  })
  it("pauses while hidden, offline or signed out", () => {
    expect(nextPollDelay({ ...base, visible: false })).toBeNull()
    expect(nextPollDelay({ ...base, online: false })).toBeNull()
    expect(nextPollDelay({ ...base, status: "expired" })).toBeNull()
  })
  it("backs off after failures, capped", () => {
    expect(nextPollDelay({ ...base, status: "error", failures: 1 })).toBe(2 * DAY_OF_POLL_MS)
    expect(nextPollDelay({ ...base, status: "error", failures: 2 })).toBe(4 * DAY_OF_POLL_MS)
    expect(nextPollDelay({ ...base, status: "error", failures: 50 })).toBe(DAY_OF_POLL_MAX_MS)
    expect(nextPollDelay({ ...base, failures: -3 })).toBe(DAY_OF_POLL_MS)
  })
})

describe("shouldSyncOnResume", () => {
  it("reads at once on return unless the last try is a few seconds old", () => {
    expect(shouldSyncOnResume(null, 10_000, "ok")).toBe(true)
    expect(shouldSyncOnResume(8_000, 10_000, "ok")).toBe(false)
    expect(shouldSyncOnResume(4_000, 10_000, "ok")).toBe(true)
  })
  it("always reads after a failure, never with an expired session", () => {
    expect(shouldSyncOnResume(9_999, 10_000, "offline")).toBe(true)
    expect(shouldSyncOnResume(9_999, 10_000, "error")).toBe(true)
    expect(shouldSyncOnResume(null, 10_000, "expired")).toBe(false)
  })
})

describe("syncStatusOf", () => {
  it("tells no network from a server that did not answer", () => {
    expect(syncStatusOf({ network: true, online: false })).toBe("offline")
    expect(syncStatusOf({ network: true, online: true })).toBe("error")
  })
  it("maps answers", () => {
    expect(syncStatusOf({ status: 200 })).toBe("ok")
    expect(syncStatusOf({ status: 401 })).toBe("expired")
    expect(syncStatusOf({ status: 403 })).toBe("expired")
    expect(syncStatusOf({ status: 404 })).toBe("error")
    expect(syncStatusOf({ status: 503 })).toBe("error")
  })
})

describe("ordering and local marks", () => {
  it("drops an answer older than the last one applied", () => {
    expect(isFreshAnswer(5, 4)).toBe(true)
    expect(isFreshAnswer(4, 5)).toBe(false)
    expect(isFreshAnswer(5, 5)).toBe(false)
  })

  it("a mark shows over the board until a poll sent after its answer", () => {
    const marks: LocalMarks = { r1: mark("2026-07-04T12:00:00.000Z", 7) }
    expect(shownCheckIn(person("r1"), marks)).toBe("2026-07-04T12:00:00.000Z")
    expect(shownCheckIn(person("r2", "x"), marks)).toBe("x")
    // Poll sent at 6, before the answer (7): stale for r1, the mark stays.
    expect(marksAfterPoll(marks, 6)).toBe(marks)
    // Poll sent at 8: it saw the mark (or newer), the board wins.
    expect(marksAfterPoll(marks, 8)).toEqual({})
  })

  it("an action in flight keeps its row as tapped, whatever the poll", () => {
    const marks: LocalMarks = { r1: mark(null, null), r2: mark("y", 1) }
    expect(marksAfterPoll(marks, 99)).toEqual({ r1: mark(null, null) })
  })

  it("an undo made here (null mark) shows as not present even if the board still says present", () => {
    expect(shownCheckIn(person("r1", "x"), { r1: mark(null, 3) })).toBeNull()
  })

  it("a mark carries the state, not only the check-in: an absence made here shows over the board (#1141)", () => {
    const marks: LocalMarks = { r1: { state: "absent", checkedInAt: null, at: 3 } }
    expect(shownState(person("r1"), marks)).toBe("absent")
    expect(shownAttendance(person("r1"), marks)).toEqual({ state: "absent", checkedInAt: null })
    // Without a mark, the board's own columns say it.
    expect(shownState(absentPerson("r2"), marks)).toBe("absent")
    expect(shownState(person("r3", "x"), marks)).toBe("present")
    expect(shownState(person("r4"), marks)).toBe("expected")
    // An absence undone here shows as expected even if the board still says absent.
    expect(shownState(absentPerson("r5"), { r5: mark(null, 4) })).toBe("expected")
  })
})

describe("boardChanges and changesAnnouncement", () => {
  it("counts presences marked and undone elsewhere", () => {
    const before = boardOf([person("a"), person("b", "x"), person("c")])
    const after = boardOf([person("a", "y"), person("b"), person("c", "z")])
    const c = boardChanges(before, {}, after, {})
    expect(c).toEqual({ arrived: 2, undone: 1, absent: 0, absenceUndone: 0, leftEarly: 0, departureUndone: 0, roster: false })
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 2 personnes marquées présentes, 1 présence annulée.")
  })

  it("does not count this phone's own marks once the board catches up", () => {
    const before = boardOf([person("a")])
    const after = boardOf([person("a", "y")])
    const marksBefore: LocalMarks = { a: mark("y", 2) }
    expect(boardChanges(before, marksBefore, after, marksAfterPoll(marksBefore, 3))).toEqual(NO_CHANGES)
  })

  it("a stale poll does not read as the user's own check-in undone", () => {
    const before = boardOf([person("a")])
    const marks: LocalMarks = { a: mark("y", 5) }
    expect(boardChanges(before, marks, before, marksAfterPoll(marks, 4))).toEqual(NO_CHANGES)
  })

  it("people joining or leaving is a roster change; moving section is not", () => {
    const before = boardOf([person("a"), person("b")], "upcoming")
    expect(boardChanges(before, {}, boardOf([person("a"), person("b")], "inProgress"), {})).toEqual(NO_CHANGES)
    expect(boardChanges(before, {}, boardOf([person("a")]), {}).roster).toBe(true)
    expect(boardChanges(before, {}, boardOf([person("a"), person("c")]), {}).roster).toBe(true)
    expect(changesAnnouncement({ ...NO_CHANGES, arrived: 1, roster: true })).toBe("Liste mise à jour : 1 personne marquée présente, la liste des personnes attendues a changé.")
  })

  it("nothing changed: nothing to say", () => {
    expect(changesAnnouncement(NO_CHANGES)).toBeNull()
  })

  it("adds up changes waiting to be said", () => {
    expect(addChanges({ ...NO_CHANGES, arrived: 1 }, { ...NO_CHANGES, arrived: 2, undone: 1, roster: true })).toEqual({ arrived: 3, undone: 1, absent: 0, absenceUndone: 0, leftEarly: 0, departureUndone: 0, roster: true })
    expect(addChanges({ ...NO_CHANGES, absent: 1 }, { ...NO_CHANGES, absent: 2, absenceUndone: 1 })).toEqual({ arrived: 0, undone: 0, absent: 3, absenceUndone: 1, leftEarly: 0, departureUndone: 0, roster: false })
  })

  it("four states: an absence marked or undone elsewhere is counted and said (#1141)", () => {
    const before = boardOf([person("a"), absentPerson("b"), person("c"), absentPerson("d")])
    const after = boardOf([absentPerson("a"), person("b"), absentPerson("c"), absentPerson("d")])
    const c = boardChanges(before, {}, after, {})
    // Expected to absent was silent when presence was a boolean.
    expect(c).toEqual({ arrived: 0, undone: 0, absent: 2, absenceUndone: 1, leftEarly: 0, departureUndone: 0, roster: false })
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 2 personnes marquées absentes, 1 absence annulée.")
    expect(changesAnnouncement({ ...NO_CHANGES, absent: 1, absenceUndone: 2 })).toBe("Liste mise à jour : 1 personne marquée absente, 2 absences annulées.")
  })

  it("four states: present here and absent there is one presence undone and one absence, never only « présence annulée » (#1141)", () => {
    const c = boardChanges(boardOf([person("a", "x"), absentPerson("b")]), {}, boardOf([absentPerson("a"), person("b", "y")]), {})
    expect(c).toEqual({ arrived: 1, undone: 1, absent: 1, absenceUndone: 1, leftEarly: 0, departureUndone: 0, roster: false })
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 1 personne marquée présente, 1 présence annulée, 1 personne marquée absente, 1 absence annulée.")
  })

  it("does not count an absence made on this phone once the board catches up (#1141)", () => {
    const marksBefore: LocalMarks = { a: { state: "absent", checkedInAt: null, at: 2 } }
    expect(boardChanges(boardOf([person("a")]), marksBefore, boardOf([absentPerson("a")]), marksAfterPoll(marksBefore, 3))).toEqual(NO_CHANGES)
  })
})

describe("four states: departures marked or undone elsewhere (#1141)", () => {
  it("present → left_early is one departure, never a presence undone", () => {
    const c = boardChanges(boardOf([person("a", "x")]), {}, boardOf([leftEarlyPerson("a")]), {})
    expect(c).toEqual({ arrived: 0, undone: 0, absent: 0, absenceUndone: 0, leftEarly: 1, departureUndone: 0, roster: false })
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 1 personne partie avant la fin.")
  })

  it("left_early → present is one departure undone, never an arrival", () => {
    const c = boardChanges(boardOf([leftEarlyPerson("a")]), {}, boardOf([person("a", "x")]), {})
    expect(c).toEqual({ arrived: 0, undone: 0, absent: 0, absenceUndone: 0, leftEarly: 0, departureUndone: 1, roster: false })
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 1 départ annulé.")
  })

  it("says the plural forms", () => {
    expect(changesAnnouncement({ ...NO_CHANGES, leftEarly: 2 })).toBe("Liste mise à jour : 2 personnes parties avant la fin.")
    expect(changesAnnouncement({ ...NO_CHANGES, departureUndone: 2 })).toBe("Liste mise à jour : 2 départs annulés.")
  })

  it("adds up the two new counters", () => {
    expect(addChanges({ ...NO_CHANGES, leftEarly: 1, departureUndone: 2 }, { ...NO_CHANGES, leftEarly: 3, departureUndone: 1 })).toEqual({ ...NO_CHANGES, leftEarly: 4, departureUndone: 3 })
  })

  it("a departure made on this phone is not counted once the board catches up", () => {
    const marksBefore: LocalMarks = { a: { state: "left_early", checkedInAt: "x", at: 2 } }
    expect(boardChanges(boardOf([person("a", "x")]), marksBefore, boardOf([leftEarlyPerson("a")]), marksAfterPoll(marksBefore, 3))).toEqual(NO_CHANGES)
  })

  it("changedShownRows names the rows whose state the board must settle", () => {
    expect(changedShownRows(boardOf([person("a"), person("b")]), {}, boardOf([leftEarlyPerson("a"), person("b")]), {})).toEqual(["a"])
    expect(changedShownRows(boardOf([person("a")]), {}, boardOf([person("a")]), {})).toEqual([])
    // A row present on one side only is a roster change, not a settle.
    expect(changedShownRows(boardOf([]), {}, boardOf([person("a")]), {})).toEqual([])
  })

  it("the settle delay is the short one the board uses", () => {
    expect(SETTLE_MS).toBe(600)
  })
})

// Two devices (#1141): this phone pressed « Marquer présent » on Inès; the server changed nothing
// and returned « absent », recorded meanwhile on another phone.
describe("conflict: the row takes the server's state, said once", () => {
  const before = boardOf([person("ines"), person("hugo")])
  const server = { state: "absent" as const, checkedInAt: null }

  it("the server's state replaces the pin, at the tick of the answer", () => {
    const pinned = pinMark({}, "ines", { state: "expected", checkedInAt: null })
    const marks = answerMark(pinned, "ines", server, 5)
    expect(marks).toEqual({ ines: { state: "absent", checkedInAt: null, at: 5 } })
    expect(shownState(person("ines"), marks)).toBe("absent")
    // Nothing of the pin is left: a later release cannot bring the old row back.
    expect(releasePin(marks, "ines")).toBe(marks)
  })

  it("no later « Liste mise à jour » echo: the read sent after the answer finds nothing new for that row", () => {
    const marks = answerMark(pinMark({}, "ines", { state: "expected", checkedInAt: null }), "ines", server, 5)
    // The deferred poll relaunched by the end of the action (sent at 6) brings the absence.
    const after = boardOf([absentPerson("ines"), person("hugo")])
    const marksAfter = marksAfterPoll(marks, 6)
    expect(marksAfter).toEqual({})
    const c = boardChanges(before, marks, after, marksAfter)
    expect(c).toEqual(NO_CHANGES)
    expect(changesAnnouncement(addChanges(NO_CHANGES, c))).toBeNull()
  })

  it("what the fix prevents: releasing the pin instead would count the conflict as a change made elsewhere", () => {
    const released = releasePin(pinMark({}, "ines", { state: "expected", checkedInAt: null }), "ines")
    const c = boardChanges(before, released, boardOf([absentPerson("ines"), person("hugo")]), marksAfterPoll(released, 6))
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 1 personne marquée absente.")
  })

  it("a read sent before the answer leaves the server's state on the row", () => {
    const marks = answerMark({}, "ines", server, 5)
    // Sent at 4, it still shows Inès expected: stale for that row, and nothing to say.
    expect(marksAfterPoll(marks, 4)).toBe(marks)
    expect(boardChanges(before, marks, before, marksAfterPoll(marks, 4))).toEqual(NO_CHANGES)
    expect(shownState(person("ines"), marksAfterPoll(marks, 4))).toBe("absent")
  })

  it("a presence recorded elsewhere comes with its instant", () => {
    const marks = answerMark(pinMark({}, "hugo", { state: "expected", checkedInAt: null }), "hugo", { state: "present", checkedInAt: "2026-07-04T12:03:00.000Z" }, 9)
    expect(shownAttendance(person("hugo"), marks)).toEqual({ state: "present", checkedInAt: "2026-07-04T12:03:00.000Z" })
  })
})

describe("noticeStillHolds: the sentence shown in a row after an action that changed nothing (#1141)", () => {
  const before = boardOf([absentPerson("ines"), person("hugo")])

  it("stays while the person shows the same state on the same shift", () => {
    expect(noticeStillHolds(before, {}, before, {}, "ines")).toBe(true)
    // The state came from this phone's mark, the read brings the same from the board.
    const marks: LocalMarks = { ines: { state: "absent", checkedInAt: null, at: 5 } }
    expect(noticeStillHolds(boardOf([person("ines"), person("hugo")]), marks, before, marksAfterPoll(marks, 6), "ines")).toBe(true)
    // Someone else's change does not touch it.
    expect(noticeStillHolds(before, {}, boardOf([absentPerson("ines"), person("hugo", "x")]), {}, "ines")).toBe(true)
  })

  it("goes when a later read changes that person's state", () => {
    expect(noticeStillHolds(before, {}, boardOf([person("ines"), person("hugo")]), {}, "ines")).toBe(false)
    expect(noticeStillHolds(before, {}, boardOf([person("ines", "x"), person("hugo")]), {}, "ines")).toBe(false)
  })

  it("goes when the person left the board or sits on another shift", () => {
    expect(noticeStillHolds(before, {}, boardOf([person("hugo")]), {}, "ines")).toBe(false)
    const elsewhere: DayOfBoard = { inProgress: [{ key: "k", date: "2026-07-04", startTime: "13:00", shifts: [shift("s2", [absentPerson("ines")])] }], upcoming: [], earlier: [], laterCount: 0 }
    expect(noticeStillHolds(before, {}, elsewhere, {}, "ines")).toBe(false)
    expect(noticeStillHolds(boardOf([]), {}, before, {}, "ines")).toBe(false)
  })
})

describe("a person with both a check-in and « absent » (rolling deployment)", () => {
  it("shows as present, and a change to it is a presence, not an absence", () => {
    const mixed: DayOfPerson = { ...person("a", "x"), attendanceStatus: "absent" }
    expect(shownState(mixed, {})).toBe("present")
    expect(boardChanges(boardOf([absentPerson("a")]), {}, boardOf([mixed]), {})).toEqual({ ...NO_CHANGES, arrived: 1, absenceUndone: 1 })
  })
})

describe("NO_CHANGES", () => {
  it("has every counter at zero", () => {
    expect(NO_CHANGES).toEqual({ arrived: 0, undone: 0, absent: 0, absenceUndone: 0, leftEarly: 0, departureUndone: 0, roster: false })
  })
})

describe("mayAnnounceChanges", () => {
  const base = { now: 100_000, lastAnnouncedAt: null, lastChangesAt: null, busy: false }
  it("says the first change", () => expect(mayAnnounceChanges(base)).toBe(true))
  it("waits while an action is in flight or the user types", () => expect(mayAnnounceChanges({ ...base, busy: true })).toBe(false))
  it("never cuts off a message said in the last 3 s", () => {
    expect(mayAnnounceChanges({ ...base, lastAnnouncedAt: 98_000 })).toBe(false)
    expect(mayAnnounceChanges({ ...base, lastAnnouncedAt: 96_000 })).toBe(true)
  })
  it("at most once a minute", () => {
    expect(mayAnnounceChanges({ ...base, lastChangesAt: 50_000 })).toBe(false)
    expect(mayAnnounceChanges({ ...base, lastChangesAt: 40_000 })).toBe(true)
  })
})

describe("freshness texts", () => {
  it("one failure stays quiet; two show; no network and expiry show at once", () => {
    expect(shownStatus("error", 1)).toBe("ok")
    expect(shownStatus("error", 2)).toBe("error")
    expect(shownStatus("offline", 1)).toBe("offline")
    expect(shownStatus("expired", 0)).toBe("expired")
  })
  it("always says how old the list is when it could not be read", () => {
    expect(syncStatusText("ok", "14h05")).toBe("Mis à jour à 14h05.")
    expect(syncStatusText("offline", "14h05")).toBe("Pas de connexion : liste de 14h05. Elle se mettra à jour au retour du réseau.")
    expect(syncStatusText("error", "14h05")).toBe("La mise à jour n'a pas abouti : liste de 14h05. Nouvel essai automatique.")
    expect(syncStatusText("expired", "14h05")).toBe("Votre session a expiré : rechargez la page pour vous reconnecter.")
  })
  it("speaks only when the kind of freshness changes", () => {
    expect(statusAnnouncement("ok", "ok", "14h05")).toBeNull()
    expect(statusAnnouncement("offline", "offline", "14h05")).toBeNull()
    expect(statusAnnouncement("ok", "offline", "14h05")).toBe("Connexion perdue. La liste affichée date de 14h05.")
    expect(statusAnnouncement("ok", "error", "14h05")).toBe("La liste n'a pas pu être mise à jour. Elle date de 14h05.")
    expect(statusAnnouncement("error", "ok", "14h07")).toBe("Connexion rétablie. Liste mise à jour à 14h07.")
    expect(statusAnnouncement("ok", "expired", "14h05")).toBe("Votre session a expiré : rechargez la page pour vous reconnecter.")
  })
})

describe("focused person leaving the board", () => {
  it("finds a person on any section", () => {
    expect(findOnBoard(boardOf([person("a")], "earlier"), "a")?.shift.id).toBe("s1")
    expect(findOnBoard(boardOf([person("a")]), "zz")).toBeNull()
  })
  it("says who left and from which shift; nothing when still listed elsewhere", () => {
    const before = boardOf([person("a")])
    expect(leftBoardAnnouncement(before, boardOf([]), "a")).toBe("Zoé a ne figure plus parmi les personnes attendues, Bar, Soir.")
    expect(leftBoardAnnouncement(before, boardOf([person("a")], "earlier"), "a")).toBeNull()
    expect(leftBoardAnnouncement(boardOf([]), boardOf([]), "a")).toBeNull()
  })
})

describe("pinMark and releasePin", () => {
  it("a failed undo puts back the check-in answered earlier but not yet seen by a poll", () => {
    const checkedIn: LocalMarks = { a: mark("y", 4) }
    const pinned = pinMark(checkedIn, "a", { state: "present", checkedInAt: "y" })
    expect(pinned.a).toEqual({ state: "present", checkedInAt: "y", at: null, prev: { state: "present", checkedInAt: "y", at: 4 } })
    expect(releasePin(pinned, "a")).toEqual(checkedIn)
  })
  it("without an earlier mark, releasing goes back to the board", () => {
    expect(releasePin(pinMark({}, "a", { state: "expected", checkedInAt: null }), "a")).toEqual({})
  })
  it("leaves an answered mark alone", () => {
    const marks: LocalMarks = { a: mark("y", 4) }
    expect(releasePin(marks, "a")).toBe(marks)
    expect(releasePin(marks, "zz")).toBe(marks)
  })
})
