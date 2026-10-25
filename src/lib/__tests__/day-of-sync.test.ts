import { describe, it, expect } from "vitest"
import {
  DAY_OF_POLL_MAX_MS,
  DAY_OF_POLL_MS,
  NO_CHANGES,
  addChanges,
  boardChanges,
  changesAnnouncement,
  findOnBoard,
  isFreshAnswer,
  leftBoardAnnouncement,
  marksAfterPoll,
  mayAnnounceChanges,
  nextPollDelay,
  pinMark,
  releasePin,
  shouldSyncOnResume,
  shownCheckIn,
  shownStatus,
  statusAnnouncement,
  syncStatusOf,
  syncStatusText,
  type LocalMarks,
} from "../day-of-sync"
import type { DayOfBoard, DayOfPerson, DayOfShift } from "../day-of"

// « Jour J » refreshes itself while open (#1141).
const person = (id: string, checkedInAt: string | null = null): DayOfPerson => ({ registrationId: id, firstName: "Zoé", lastName: id, phone: null, checkedInAt })
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
    const marks: LocalMarks = { r1: { checkedInAt: "2026-07-04T12:00:00.000Z", at: 7 } }
    expect(shownCheckIn(person("r1"), marks)).toBe("2026-07-04T12:00:00.000Z")
    expect(shownCheckIn(person("r2", "x"), marks)).toBe("x")
    // Poll sent at 6, before the answer (7): stale for r1, the mark stays.
    expect(marksAfterPoll(marks, 6)).toBe(marks)
    // Poll sent at 8: it saw the mark (or newer), the board wins.
    expect(marksAfterPoll(marks, 8)).toEqual({})
  })

  it("an action in flight keeps its row as tapped, whatever the poll", () => {
    const marks: LocalMarks = { r1: { checkedInAt: null, at: null }, r2: { checkedInAt: "y", at: 1 } }
    expect(marksAfterPoll(marks, 99)).toEqual({ r1: { checkedInAt: null, at: null } })
  })

  it("an undo made here (null mark) shows as not present even if the board still says present", () => {
    expect(shownCheckIn(person("r1", "x"), { r1: { checkedInAt: null, at: 3 } })).toBeNull()
  })
})

describe("boardChanges and changesAnnouncement", () => {
  it("counts presences marked and undone elsewhere", () => {
    const before = boardOf([person("a"), person("b", "x"), person("c")])
    const after = boardOf([person("a", "y"), person("b"), person("c", "z")])
    const c = boardChanges(before, {}, after, {})
    expect(c).toEqual({ arrived: 2, undone: 1, roster: false })
    expect(changesAnnouncement(c)).toBe("Liste mise à jour : 2 personnes marquées présentes, 1 présence annulée.")
  })

  it("does not count this phone's own marks once the board catches up", () => {
    const before = boardOf([person("a")])
    const after = boardOf([person("a", "y")])
    const marksBefore: LocalMarks = { a: { checkedInAt: "y", at: 2 } }
    expect(boardChanges(before, marksBefore, after, marksAfterPoll(marksBefore, 3))).toEqual(NO_CHANGES)
  })

  it("a stale poll does not read as the user's own check-in undone", () => {
    const before = boardOf([person("a")])
    const marks: LocalMarks = { a: { checkedInAt: "y", at: 5 } }
    expect(boardChanges(before, marks, before, marksAfterPoll(marks, 4))).toEqual(NO_CHANGES)
  })

  it("people joining or leaving is a roster change; moving section is not", () => {
    const before = boardOf([person("a"), person("b")], "upcoming")
    expect(boardChanges(before, {}, boardOf([person("a"), person("b")], "inProgress"), {})).toEqual(NO_CHANGES)
    expect(boardChanges(before, {}, boardOf([person("a")]), {}).roster).toBe(true)
    expect(boardChanges(before, {}, boardOf([person("a"), person("c")]), {}).roster).toBe(true)
    expect(changesAnnouncement({ arrived: 1, undone: 0, roster: true })).toBe("Liste mise à jour : 1 personne marquée présente, la liste des personnes attendues a changé.")
  })

  it("nothing changed: nothing to say", () => {
    expect(changesAnnouncement(NO_CHANGES)).toBeNull()
  })

  it("adds up changes waiting to be said", () => {
    expect(addChanges({ arrived: 1, undone: 0, roster: false }, { arrived: 2, undone: 1, roster: true })).toEqual({ arrived: 3, undone: 1, roster: true })
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
    const checkedIn: LocalMarks = { a: { checkedInAt: "y", at: 4 } }
    const pinned = pinMark(checkedIn, "a", "y")
    expect(pinned.a).toEqual({ checkedInAt: "y", at: null, prev: { checkedInAt: "y", at: 4 } })
    expect(releasePin(pinned, "a")).toEqual(checkedIn)
  })
  it("without an earlier mark, releasing goes back to the board", () => {
    expect(releasePin(pinMark({}, "a", null), "a")).toEqual({})
  })
  it("leaves an answered mark alone", () => {
    const marks: LocalMarks = { a: { checkedInAt: "y", at: 4 } }
    expect(releasePin(marks, "a")).toBe(marks)
    expect(releasePin(marks, "zz")).toBe(marks)
  })
})
