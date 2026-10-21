import { describe, it, expect } from "vitest"
import {
  ROSTER_SIGNUP_LABEL,
  buildShiftRoster,
  choiceAfterSignup,
  isKnownMinor,
  rosterButtonLabel,
  rosterDisplayName,
  rosterOpen,
  rosterSpokenName,
  signupRosterBox,
  viewerState,
  viewerStateText,
  type RosterChoice,
  type RosterRegistration,
} from "../shift-roster"

// Shift roster between volunteers (#1068): pure visibility and format rules.

describe("rosterDisplayName", () => {
  it("gives the first name and the last-name initial only", () => {
    expect(rosterDisplayName("Aline", "Martin")).toBe("Aline M.")
    expect(rosterDisplayName("  Jean  Paul ", " dupont")).toBe("Jean Paul D.")
    expect(rosterDisplayName("Zoé", "Éluard")).toBe("Zoé É.")
  })

  it("never returns more of the last name", () => {
    const name = rosterDisplayName("Aline", "Martin-Durand")!
    expect(name).toBe("Aline M.")
    expect(name).not.toContain("artin")
  })

  it("copes with a missing last name or first name", () => {
    expect(rosterDisplayName("Aline", "")).toBe("Aline")
    expect(rosterDisplayName("  ", "Martin")).toBeNull()
  })

  it("the sign-up label says what is shown, with the same format", () => {
    expect(ROSTER_SIGNUP_LABEL).toContain("prénom et l'initiale de mon nom")
    expect(ROSTER_SIGNUP_LABEL).toContain("« Aline M. »")
  })
})

describe("isKnownMinor", () => {
  it("is false without a birth date (never asked for this)", () => {
    expect(isKnownMinor(null, "2030-10-01")).toBe(false)
  })
  it("compares with the event's first day", () => {
    expect(isKnownMinor("2012-10-02", "2030-10-01")).toBe(true) // 17 the day before their birthday
    expect(isKnownMinor("2012-10-01", "2030-10-01")).toBe(false) // 18 that day
  })
  it("fails closed on an unreadable date", () => {
    expect(isKnownMinor("not a date", "2030-10-01")).toBe(true)
  })
})

describe("rosterOpen", () => {
  const event = { shiftRosterEnabled: true, personalDataAnonymizedAt: null, endDate: "2030-10-02T00:00:00.000Z" }
  const TZ = "Europe/Zurich"
  it("only when turned on", () => {
    expect(rosterOpen(event, new Date("2030-10-01T10:00:00Z"), TZ)).toBe(true)
    expect(rosterOpen({ ...event, shiftRosterEnabled: false }, new Date("2030-10-01T10:00:00Z"), TZ)).toBe(false)
  })
  it("closes once the event's last day is over in the organisation's zone", () => {
    expect(rosterOpen(event, new Date("2030-10-02T21:59:00Z"), TZ)).toBe(true) // 23:59 in Zurich
    expect(rosterOpen(event, new Date("2030-10-02T22:01:00Z"), TZ)).toBe(false) // next day in Zurich
  })
  it("never on an anonymised event", () => {
    expect(rosterOpen({ ...event, personalDataAnonymizedAt: new Date() }, new Date("2030-10-01T10:00:00Z"), TZ)).toBe(false)
  })
})

describe("choiceAfterSignup", () => {
  const all: (RosterChoice | null)[] = [null, "visible", "pending", "hidden"]

  it("a verified sign-up that accepts makes the name visible", () => {
    for (const stored of all) expect(choiceAfterSignup({ stored, requested: true, verified: true, minor: false })).toBe("visible")
  })

  it("an unticked box never withdraws nor grants: no new choice", () => {
    for (const stored of all) expect(choiceAfterSignup({ stored, requested: false, verified: true, minor: false })).toBe(stored)
  })

  it("an unverified sign-up never makes anyone visible", () => {
    for (const stored of all) {
      for (const requested of [true, false]) {
        expect(choiceAfterSignup({ stored, requested, verified: false, minor: false })).not.toBe("visible")
      }
    }
  })

  it("an unverified acceptance waits for confirmation; an earlier acceptance is suspended", () => {
    expect(choiceAfterSignup({ stored: null, requested: true, verified: false, minor: false })).toBe("pending")
    expect(choiceAfterSignup({ stored: null, requested: false, verified: false, minor: false })).toBeNull()
    expect(choiceAfterSignup({ stored: "visible", requested: false, verified: false, minor: false })).toBe("pending")
    expect(choiceAfterSignup({ stored: "visible", requested: true, verified: false, minor: false })).toBe("pending")
  })

  it("keeps a refusal whatever an unverified form says", () => {
    expect(choiceAfterSignup({ stored: "hidden", requested: true, verified: false, minor: false })).toBe("hidden")
  })

  it("ignores a known minor's acceptance", () => {
    expect(choiceAfterSignup({ stored: null, requested: true, verified: true, minor: true })).toBeNull()
    expect(choiceAfterSignup({ stored: null, requested: true, verified: false, minor: true })).toBeNull()
  })
})

describe("buildShiftRoster", () => {
  const person = (id: string, first: string, last: string, more: Partial<RosterRegistration["volunteer"]> = {}) =>
    ({ id, volunteer: { firstName: first, lastName: last, birthDate: null, erasedAt: null, mergedIntoId: null, ...more } })
  const reg = (shiftId: string, p: ReturnType<typeof person>, status = "active"): RosterRegistration =>
    ({ shiftId, volunteerId: p.id, status, volunteer: p.volunteer })
  const shift = (id: string, startTime = "10:00") => ({ id, label: id, date: new Date("2030-10-01T00:00:00Z"), startTime, endTime: "12:00" })
  const names = (entries: { shiftId: string; names: string[] }[]) => entries.map((e) => ({ shiftId: e.shiftId, names: e.names }))

  const me = person("me", "Moi", "Même")
  const aline = person("aline", "Aline", "Martin")
  const bruno = person("bruno", "Bruno", "Keller")
  const chloe = person("chloe", "Chloé", "Roux")

  it("names, shift by shift over the whole event, the other confirmed volunteers who chose visible", () => {
    const roster = buildShiftRoster({
      viewerId: "me",
      shifts: [shift("bar"), shift("accueil", "14:00"), shift("vestiaire", "17:00")],
      registrations: [reg("bar", me), reg("bar", bruno), reg("bar", aline), reg("accueil", me), reg("accueil", chloe), reg("vestiaire", aline)],
      choices: new Map<string, RosterChoice>([["me", "visible"], ["aline", "visible"], ["bruno", "visible"], ["chloe", "hidden"]]),
      eventStart: "2030-10-01",
    })
    // A shift the viewer is not on is listed too (choosing by affinity); one without names is left out.
    expect(names(roster)).toEqual([
      { shiftId: "bar", names: ["Aline M.", "Bruno K."] },
      { shiftId: "vestiaire", names: ["Aline M."] },
    ])
    expect(roster[0]).toMatchObject({ label: "bar", startTime: "10:00", endTime: "12:00", date: "2030-10-01T00:00:00.000Z" })
  })

  it("two people with the same display name are both listed", () => {
    const aline2 = person("aline2", "Aline", "Meier")
    const roster = buildShiftRoster({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", aline), reg("bar", aline2)],
      choices: new Map<string, RosterChoice>([["aline", "visible"], ["aline2", "visible"]]),
      eventStart: "2030-10-01",
    })
    expect(roster[0].names).toEqual(["Aline M.", "Aline M."])
  })

  it("never the viewer themself", () => {
    const roster = buildShiftRoster({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", me)],
      choices: new Map([["me", "visible" as RosterChoice]]),
      eventStart: "2030-10-01",
    })
    expect(roster).toEqual([])
  })

  it("leaves out pending, hidden, no choice, unconfirmed, erased, merged and minors", () => {
    const pending = person("p", "Paul", "Pending")
    const none = person("n", "Nina", "None")
    const waiting = person("w", "Wanda", "Waiting")
    const erased = person("e", "Bénévole", "effacé", { erasedAt: new Date() })
    const merged = person("m", "Max", "Merged", { mergedIntoId: "x" })
    const minor = person("k", "Kim", "Kid", { birthDate: "2015-01-01" })
    const roster = buildShiftRoster({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", pending), reg("bar", none), reg("bar", waiting, "waiting"), reg("bar", waiting, "requested"), reg("bar", erased), reg("bar", merged), reg("bar", minor), reg("bar", aline, "cancelled")],
      choices: new Map<string, RosterChoice>([["p", "pending"], ["w", "visible"], ["e", "visible"], ["m", "visible"], ["k", "visible"], ["aline", "visible"]]),
      eventStart: "2030-10-01",
    })
    expect(roster).toEqual([])
  })

  it("only the shift's public fields and display strings come out", () => {
    const roster = buildShiftRoster({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", aline)],
      choices: new Map([["aline", "visible" as RosterChoice]]),
      eventStart: "2030-10-01",
    })
    expect(Object.keys(roster[0]).sort()).toEqual(["date", "endTime", "label", "names", "shiftId", "startTime"])
    expect(JSON.stringify(roster)).not.toContain("aline")
    expect(JSON.stringify(roster)).not.toContain("Martin")
  })
})

describe("signupRosterBox and spoken names", () => {
  it("shows the box only on a roster event, a sentence for a minor's birth date", () => {
    expect(signupRosterBox(false, "", "2030-10-01")).toBeNull()
    expect(signupRosterBox(true, "", "2030-10-01")).toBe("box")
    expect(signupRosterBox(true, "2015-01-01", "2030-10-01")).toBe("minor")
    expect(signupRosterBox(true, "1990-01-01", "2030-10-01")).toBe("box")
    expect(signupRosterBox(true, "2015-01", "2030-10-01")).toBe("box") // still being typed
  })
  it("says the initial so that « M. » is not read « Monsieur »", () => {
    expect(rosterSpokenName("Aline M.")).toBe("Aline, initiale M")
    expect(rosterSpokenName("Aline")).toBe("Aline")
  })
})

describe("viewer state", () => {
  it("no choice reads as hidden; a minor is always minor", () => {
    expect(viewerState(null, false)).toBe("hidden")
    expect(viewerState("visible", true)).toBe("minor")
    expect(viewerState("pending", false)).toBe("pending")
  })
  it("the button names the action", () => {
    expect(rosterButtonLabel("visible")).toBe("Masquer mon nom")
    expect(rosterButtonLabel("hidden")).toBe("Afficher mon nom")
    expect(rosterButtonLabel("pending")).toBe("Afficher mon nom")
  })
  it("the sentence quotes the viewer's own display name", () => {
    expect(viewerStateText("visible", "Aline M.")).toContain("« Aline M. »")
    expect(viewerStateText("pending", "Aline M.")).toContain("confirmé ici")
  })
})
