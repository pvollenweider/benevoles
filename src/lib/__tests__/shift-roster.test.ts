import { describe, it, expect } from "vitest"
import {
  buildShiftRoster, choiceAfterSignup, isKnownMinor, rosterOpen, signupRosterBox, viewerState, type RosterAudience,
  type RosterChoice, type RosterRegistration, type StoredRosterChoice, ROSTER_NOTICE_V1, ROSTER_NOTICE_VERSION,
  eventPageRosterViewer, inviteRosterAudience, noticeReaches, rosterAfterSignup, rosterEventHref, signupNoticeVersion,
} from "../shift-roster"
import {
  ROSTER_SIGNUP_LABEL, rosterStateText, rosterChoiceText, ROSTER_DOC_LINKS, ROSTER_ORG_DEFAULT_HINT, rosterDisplayName, rosterSpokenName, rosterOthersText, rosterVisibleName,
  ROSTER_COUNT_NOTICE, ROSTER_EMPTY_TEXT, ROSTER_ENABLE_REMINDER, ROSTER_MINOR_TEXT, ROSTER_SETTING_HINT, ROSTER_SIGNUP_HINT,
  rosterSummary, ROSTER_PUBLISH_NOTE_ON, ROSTER_PUBLISH_NOTE, rosterDoneText,
} from "../shift-roster-text"

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
  const names = (entries: { shiftId: string; names: string[]; othersCount: number }[]) => entries.map((e) => ({ shiftId: e.shiftId, names: e.names, othersCount: e.othersCount }))

  // The choices of these cases, all given under the current text, for a confirmed viewer.
  const roster_ = (input: Omit<Parameters<typeof buildShiftRoster>[0], "choices" | "audience"> & { choices: Map<string, RosterChoice>; audience?: RosterAudience }) =>
    buildShiftRoster({ audience: "confirmed", ...input, choices: new Map([...input.choices].map(([id, status]) => [id, { status, noticeVersion: ROSTER_NOTICE_VERSION }])) })

  const me = person("me", "Moi", "Même")
  const aline = person("aline", "Aline", "Martin")
  const bruno = person("bruno", "Bruno", "Keller")
  const chloe = person("chloe", "Chloé", "Roux")

  it("names, shift by shift over the whole event, the other confirmed volunteers who chose visible", () => {
    const roster = roster_({
      viewerId: "me",
      shifts: [shift("bar"), shift("accueil", "14:00"), shift("vestiaire", "17:00")],
      registrations: [reg("bar", me), reg("bar", bruno), reg("bar", aline), reg("accueil", me), reg("accueil", chloe), reg("vestiaire", aline)],
      choices: new Map<string, RosterChoice>([["me", "visible"], ["aline", "visible"], ["bruno", "visible"], ["chloe", "hidden"]]),
      eventStart: "2030-10-01",
    })
    // A shift the viewer is not on is listed too (choosing by affinity); one with only hidden
    // people says how many, without their names; one with nobody else is left out.
    expect(names(roster)).toEqual([
      { shiftId: "bar", names: ["Aline M.", "Bruno K."], othersCount: 0 },
      { shiftId: "accueil", names: [], othersCount: 1 },
      { shiftId: "vestiaire", names: ["Aline M."], othersCount: 0 },
    ])
    expect(JSON.stringify(roster)).not.toContain("Chlo")
    expect(roster[0]).toMatchObject({ label: "bar", startTime: "10:00", endTime: "12:00", date: "2030-10-01T00:00:00.000Z" })
  })

  it("two people with the same display name are both listed", () => {
    const aline2 = person("aline2", "Aline", "Meier")
    const roster = roster_({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", aline), reg("bar", aline2)],
      choices: new Map<string, RosterChoice>([["aline", "visible"], ["aline2", "visible"]]),
      eventStart: "2030-10-01",
    })
    expect(roster[0].names).toEqual(["Aline M.", "Aline M."])
    expect(roster[0].othersCount).toBe(0)
  })

  it("never the viewer themself, neither named nor counted, whatever their choice", () => {
    for (const choice of ["visible", "hidden", "pending"] as RosterChoice[]) {
      const roster = roster_({
        viewerId: "me", shifts: [shift("bar")],
        registrations: [reg("bar", me)],
        choices: new Map([["me", choice]]),
        eventStart: "2030-10-01",
      })
      // Their own shift is listed (the personal page shows those), with nobody else on it.
      expect(roster).toMatchObject([{ shiftId: "bar", names: [], othersCount: 0, own: true }])
    }
    const roster = roster_({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", me), reg("bar", bruno)],
      choices: new Map<string, RosterChoice>(),
      eventStart: "2030-10-01",
    })
    expect(names(roster)).toEqual([{ shiftId: "bar", names: [], othersCount: 1 }])
  })

  it("names nobody pending, hidden, no choice, unconfirmed, erased, merged or minor; counts the confirmed ones alike", () => {
    const pending = person("p", "Paul", "Pending")
    const none = person("n", "Nina", "None")
    const waiting = person("w", "Wanda", "Waiting")
    const erased = person("e", "Bénévole", "effacé", { erasedAt: new Date() })
    const merged = person("m", "Max", "Merged", { mergedIntoId: "x" })
    const minor = person("k", "Kim", "Kid", { birthDate: "2015-01-01" })
    const roster = roster_({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", pending), reg("bar", none), reg("bar", waiting, "waiting"), reg("bar", waiting, "requested"), reg("bar", erased), reg("bar", merged), reg("bar", minor), reg("bar", aline, "cancelled")],
      choices: new Map<string, RosterChoice>([["p", "pending"], ["w", "visible"], ["e", "visible"], ["m", "visible"], ["k", "visible"], ["aline", "visible"]]),
      eventStart: "2030-10-01",
    })
    // Counted: pending, no choice, erased, minor (4), the same whatever the reason. Not counted:
    // waitlisted or requested places, a merged record, a cancelled registration.
    expect(names(roster)).toEqual([{ shiftId: "bar", names: [], othersCount: 4 }])
  })

  it("counts every other confirmed volunteer not named, once, beside the names", () => {
    const hidden = person("h", "Hugo", "Hidden")
    const roster = roster_({
      viewerId: "me", shifts: [shift("bar"), shift("accueil", "14:00")],
      // Two registrations of the same person on one shift count once; the viewer never.
      registrations: [reg("bar", me), reg("bar", aline), reg("bar", bruno), reg("bar", hidden), reg("bar", hidden), reg("bar", chloe), reg("accueil", hidden)],
      choices: new Map<string, RosterChoice>([["aline", "visible"], ["bruno", "hidden"], ["chloe", "pending"]]),
      eventStart: "2030-10-01",
    })
    expect(names(roster)).toEqual([
      { shiftId: "bar", names: ["Aline M."], othersCount: 3 },
      { shiftId: "accueil", names: [], othersCount: 1 },
    ])
  })

  it("all hidden: only the count; none hidden: zero", () => {
    const everyone = [aline, bruno, chloe]
    const hiddenAll = roster_({
      viewerId: "me", shifts: [shift("bar")], registrations: everyone.map((p) => reg("bar", p)),
      choices: new Map<string, RosterChoice>(), eventStart: "2030-10-01",
    })
    expect(names(hiddenAll)).toEqual([{ shiftId: "bar", names: [], othersCount: 3 }])
    const shownAll = roster_({
      viewerId: "me", shifts: [shift("bar")], registrations: everyone.map((p) => reg("bar", p)),
      choices: new Map<string, RosterChoice>(everyone.map((p) => [p.id, "visible"])), eventStart: "2030-10-01",
    })
    expect(names(shownAll)).toEqual([{ shiftId: "bar", names: ["Aline M.", "Bruno K.", "Chloé R."], othersCount: 0 }])
  })

  it("only the shift's public fields and display strings come out", () => {
    const roster = roster_({
      viewerId: "me", shifts: [shift("bar")],
      registrations: [reg("bar", aline)],
      choices: new Map([["aline", "visible" as RosterChoice]]),
      eventStart: "2030-10-01",
    })
    expect(Object.keys(roster[0]).sort()).toEqual(["date", "endTime", "label", "names", "othersCount", "own", "shiftId", "startTime"])
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
  it("prints the initial glued to the first name, speaks it plainly", () => {
    expect(rosterVisibleName("Léa F.")).toBe("Léa\u00a0F.")
    expect(rosterVisibleName("Jean Paul D.")).toBe("Jean Paul\u00a0D.")
    expect(rosterVisibleName("Aline")).toBe("Aline")
    expect(rosterSpokenName("Léa F.")).toBe("Léa, initiale F")
    // Nor between the quotes and the name.
    expect(rosterChoiceText("hidden", rosterVisibleName("Léa F."))).toContain("«\u00a0Léa\u00a0F.\u00a0»")
  })
  it("says the initial so that « M. » is not read « Monsieur »", () => {
    expect(rosterSpokenName("Aline M.")).toBe("Aline, initiale M")
    expect(rosterSpokenName("Aline")).toBe("Aline")
  })
})

describe("viewer state", () => {
  it("no choice reads as hidden; a minor is always minor", () => {
    const at = (status: RosterChoice, noticeVersion = ROSTER_NOTICE_VERSION): StoredRosterChoice => ({ status, noticeVersion })
    expect(viewerState(null, false)).toBe("hidden")
    expect(viewerState(at("visible"), true)).toBe("minor")
    expect(viewerState(at("pending"), false)).toBe("pending")
    expect(viewerState(at("visible"), false)).toBe("visible")
    // Shown under the first text: to confirmed volunteers only, with the offer of the current one.
    expect(viewerState(at("visible", ROSTER_NOTICE_V1), false)).toBe("visible_confirmed")
    expect(viewerState(at("hidden", ROSTER_NOTICE_V1), false)).toBe("hidden")
    // An unknown text is shown to nobody: the page says hidden.
    expect(viewerState(at("visible", "2099-01-01"), false)).toBe("hidden")
  })
  it("the switch's state is always written in words, with the viewer's display name when shown", () => {
    expect(rosterStateText("visible", "Aline M.")).toBe("Visible : «\u00a0Aline M.\u00a0»")
    expect(rosterStateText("visible_confirmed", "Aline M.")).toBe("Visible aux bénévoles confirmés : «\u00a0Aline M.\u00a0»")
    expect(rosterStateText("visible", null)).toBe("Visible")
    expect(rosterStateText("hidden", "Aline M.")).toBe("Masqué")
    expect(rosterStateText("pending", "Aline M.")).toMatch(/^À confirmer : tu l'as demandé à l'inscription\./)
  })
  it("off or to confirm, the description says everything a first consent needs", () => {
    for (const state of ["hidden", "pending"] as const) {
      const text = rosterChoiceText(state, "Aline M.")
      for (const part of ["les bénévoles confirmés et les membres invités par l'organisation", "«\u00a0Aline M.\u00a0»", "sur tes créneaux confirmés",
        "même sans créneau commun avec toi", "jusqu'à la fin de l'événement", "pour choisir leurs créneaux", "facultatif, sans effet sur ton inscription", "masquer à tout moment"]) {
        expect(text, `${state}: ${part}`).toContain(part)
      }
    }
    // Shown under the first text: the narrower audience, until the current one is accepted.
    expect(rosterChoiceText("visible_confirmed", "Aline M.")).not.toContain("membres invités")
    expect(rosterChoiceText("visible", "Aline M.")).toContain("membres invités")
    expect(rosterChoiceText("minor", null)).toContain("moins de 18 ans")
  })
})

describe("count of the others", () => {
  it("singular and plural, after names or alone, nothing for zero", () => {
    expect(rosterOthersText(1, true)).toBe("et 1 autre bénévole")
    expect(rosterOthersText(3, true)).toBe("et 3 autres bénévoles")
    expect(rosterOthersText(1, false)).toBe("1 autre bénévole, sans nom affiché")
    expect(rosterOthersText(2, false)).toBe("2 autres bénévoles, sans nom affiché")
    expect(rosterOthersText(0, true)).toBeNull()
    expect(rosterOthersText(0, false)).toBeNull()
  })
  it("volunteers and organisers are told the count needs no choice", () => {
    expect(ROSTER_SIGNUP_HINT).toContain(ROSTER_COUNT_NOTICE)
    expect(ROSTER_MINOR_TEXT).toContain(ROSTER_COUNT_NOTICE)
    expect(ROSTER_ENABLE_REMINDER).toContain("y compris les personnes déjà inscrites")
    expect(ROSTER_ENABLE_REMINDER).toContain("comptée même si leur nom reste masqué")
    expect(ROSTER_EMPTY_TEXT).toBe("Aucun créneau confirmé pour l'instant.")
  })
})

describe("audience by consent text (#1068 follow-up)", () => {
  it("the current text reaches confirmed volunteers and invited members; the first one, confirmed volunteers only; any other, nobody", () => {
    expect(noticeReaches(ROSTER_NOTICE_VERSION, "confirmed")).toBe(true)
    expect(noticeReaches(ROSTER_NOTICE_VERSION, "invited")).toBe(true)
    expect(noticeReaches(ROSTER_NOTICE_V1, "confirmed")).toBe(true)
    expect(noticeReaches(ROSTER_NOTICE_V1, "invited")).toBe(false)
    for (const v of ["", "2099-01-01", null, undefined]) {
      expect(noticeReaches(v, "confirmed")).toBe(false)
      expect(noticeReaches(v, "invited")).toBe(false)
    }
  })

  it("a sign-up form's version: the current one only when the form says so", () => {
    expect(signupNoticeVersion(ROSTER_NOTICE_VERSION)).toBe(ROSTER_NOTICE_VERSION)
    for (const v of [undefined, null, "", ROSTER_NOTICE_V1, "2099-01-01", 3]) expect(signupNoticeVersion(v)).toBe(ROSTER_NOTICE_V1)
  })

  it("the current label names both audiences and the format; its hint the scope, purpose and count", () => {
    expect(ROSTER_SIGNUP_LABEL).toContain("bénévoles confirmés et les membres invités par l'organisation")
    expect(ROSTER_SIGNUP_HINT).toContain("même sans créneau commun avec toi")
    expect(ROSTER_SIGNUP_HINT).toContain("jusqu'à la fin de l'événement")
    expect(ROSTER_SIGNUP_HINT).toContain("Facultatif, sans effet sur ton inscription")
  })

  const shift = (id: string) => ({ id, label: id, date: new Date("2030-10-01T00:00:00Z"), startTime: "10:00", endTime: "12:00" })
  const person = (id: string, first: string, last: string) => ({ id, volunteer: { firstName: first, lastName: last, birthDate: null, erasedAt: null, mergedIntoId: null } })
  const reg = (shiftId: string, p: ReturnType<typeof person>): RosterRegistration => ({ shiftId, volunteerId: p.id, status: "active", volunteer: p.volunteer })
  const old = person("old", "Odile", "Ancien")
  const recent = person("new", "Nora", "Nouveau")
  const strange = person("x", "Xavier", "Inconnu")
  const choices = new Map<string, StoredRosterChoice>([
    ["old", { status: "visible", noticeVersion: ROSTER_NOTICE_V1 }],
    ["new", { status: "visible", noticeVersion: ROSTER_NOTICE_VERSION }],
    ["x", { status: "visible", noticeVersion: "2099-01-01" }],
  ])
  const build = (audience: RosterAudience) => buildShiftRoster({ viewerId: "viewer", shifts: [shift("bar")], registrations: [reg("bar", old), reg("bar", recent), reg("bar", strange)], choices, audience, eventStart: "2030-10-01" })

  it("a confirmed volunteer sees the names given under either known text; the others are counted", () => {
    expect(build("confirmed")).toMatchObject([{ shiftId: "bar", names: ["Nora N.", "Odile A."], othersCount: 1, own: false }])
  })

  it("an invited member never sees a name given under the first text: counted instead", () => {
    const roster = build("invited")
    expect(roster).toMatchObject([{ shiftId: "bar", names: ["Nora N."], othersCount: 2 }])
    expect(JSON.stringify(roster)).not.toContain("Odile")
    expect(JSON.stringify(roster)).not.toContain("Xavier")
  })
})

describe("rosterAfterSignup: the text's version", () => {
  const V2 = ROSTER_NOTICE_VERSION
  it("a verified new acceptance stores the version the form showed", () => {
    expect(rosterAfterSignup({ stored: null, requested: true, verified: true, minor: false, noticeVersion: V2 })).toEqual({ status: "visible", noticeVersion: V2 })
    expect(rosterAfterSignup({ stored: null, requested: true, verified: true, minor: false, noticeVersion: ROSTER_NOTICE_V1 })).toEqual({ status: "visible", noticeVersion: ROSTER_NOTICE_V1 })
  })
  it("a verified acceptance of the current text widens a first-text acceptance (same state, new version)", () => {
    expect(rosterAfterSignup({ stored: { status: "visible", noticeVersion: ROSTER_NOTICE_V1 }, requested: true, verified: true, minor: false, noticeVersion: V2 })).toEqual({ status: "visible", noticeVersion: V2 })
  })
  it("a sign-up without a new choice never widens an earlier audience", () => {
    const first = { status: "visible" as const, noticeVersion: ROSTER_NOTICE_V1 }
    expect(rosterAfterSignup({ stored: first, requested: false, verified: true, minor: false, noticeVersion: V2 })).toBeNull()
    // Unverified: suspended, still under its own text.
    expect(rosterAfterSignup({ stored: first, requested: false, verified: false, minor: false, noticeVersion: V2 })).toEqual({ status: "pending", noticeVersion: ROSTER_NOTICE_V1 })
  })
  it("nothing to store when nothing changes", () => {
    expect(rosterAfterSignup({ stored: { status: "visible", noticeVersion: V2 }, requested: true, verified: true, minor: false, noticeVersion: V2 })).toBeNull()
    expect(rosterAfterSignup({ stored: null, requested: false, verified: false, minor: false, noticeVersion: V2 })).toBeNull()
    expect(rosterAfterSignup({ stored: null, requested: true, verified: true, minor: true, noticeVersion: V2 })).toBeNull()
    // A refusal stays as it was, under its own text and date.
    expect(rosterAfterSignup({ stored: { status: "hidden", noticeVersion: ROSTER_NOTICE_V1 }, requested: true, verified: false, minor: false, noticeVersion: V2 })).toBeNull()
  })
})

describe("who the event page reads the roster as", () => {
  const base = { enabled: true, embed: false, preview: false, groupLink: false, inviteToken: null, sessionToken: null }
  it("nobody anonymous, on a group link, in the embed, the preview, or without the roster", () => {
    expect(eventPageRosterViewer(base)).toBeNull()
    for (const over of [{ groupLink: true }, { embed: true }, { preview: true }, { enabled: false }]) {
      expect(eventPageRosterViewer({ ...base, sessionToken: "s", inviteToken: "i", ...over })).toBeNull()
    }
  })
  it("an invitation in the address first, else the browser's session", () => {
    expect(eventPageRosterViewer({ ...base, inviteToken: "i", sessionToken: "s" })).toEqual({ kind: "invite", token: "i" })
    expect(eventPageRosterViewer({ ...base, sessionToken: "s" })).toEqual({ kind: "personal", token: "s" })
  })
})

describe("what an invitation may see", () => {
  const open = { active: true, erased: false, merged: false, declined: false, used: false, confirmedOnEvent: false }
  it("an open invitation: as an invited member", () => {
    expect(inviteRosterAudience(open)).toBe("invited")
  })
  it("a member with a confirmed place: as a confirmed volunteer, even after declining or using it", () => {
    expect(inviteRosterAudience({ ...open, confirmedOnEvent: true, used: true, declined: true })).toBe("confirmed")
  })
  it("declined, or used to sign up without a confirmed place now: nothing", () => {
    expect(inviteRosterAudience({ ...open, declined: true })).toBeNull()
    expect(inviteRosterAudience({ ...open, used: true })).toBeNull()
  })
  it("never an inactive, erased or merged member", () => {
    for (const over of [{ active: false }, { erased: true }, { merged: true }]) expect(inviteRosterAudience({ ...open, confirmedOnEvent: true, ...over })).toBeNull()
  })
})

describe("a shift's roster in one sentence", () => {
  it("names, then the others; the others alone; nobody", () => {
    expect(rosterSummary({ names: ["Aline M.", "Luc D."], othersCount: 2 })).toBe("Aline M., Luc D. et 2 autres bénévoles")
    expect(rosterSummary({ names: ["Aline M.", "Luc D.", "Zoé R."], othersCount: 0 })).toBe("Aline M., Luc D. et Zoé R.")
    expect(rosterSummary({ names: ["Aline M."], othersCount: 1 })).toBe("Aline M. et 1 autre bénévole")
    expect(rosterSummary({ names: [], othersCount: 3 })).toBe("3 autres bénévoles, sans nom affiché")
    expect(rosterSummary(undefined)).toBe("personne d'autre pour l'instant")
    expect(rosterSummary({ names: ["Aline M."], othersCount: 0 }, rosterSpokenName)).toBe("Aline, initiale M")
  })
  it("the personal page's link turns the switch on, keeping the URL's query", () => {
    expect(rosterEventHref("https://club.benevol.app/fete")).toBe("https://club.benevol.app/fete?inscrits=1")
    expect(rosterEventHref("http://localhost:3000/fete?org=club")).toBe("http://localhost:3000/fete?org=club&inscrits=1")
  })
  it("the publication note says it is on and recalls the duty to inform; the done texts", () => {
    expect(ROSTER_PUBLISH_NOTE_ON).toContain("est activé")
    expect(ROSTER_PUBLISH_NOTE_ON).toContain("prévenez vos bénévoles")
    expect(rosterDoneText("widen")).toContain("membres invités")
    expect(rosterDoneText("hide")).toBe("Ton nom est maintenant masqué.")
  })
})

describe("buildShiftRoster reads each registration a bounded number of times", () => {
  // Counts every property read on the registrations (and their volunteer): grouping them by shift
  // once keeps it proportional to the registrations, whatever the number of shifts. Re-scanning
  // every registration for each shift would multiply it by the number of shifts.
  function run(shiftCount: number, registrationCount: number) {
    let reads = 0
    const counted = <T extends object>(o: T): T => new Proxy(o, { get: (t, k, r) => { reads++; return Reflect.get(t, k, r) } })
    const shifts = Array.from({ length: shiftCount }, (_, i) => ({ id: `s${i}`, label: `S${i}`, date: "2099-10-01", startTime: "10:00", endTime: "12:00" }))
    const registrations: RosterRegistration[] = Array.from({ length: registrationCount }, (_, i) => counted({
      shiftId: `s${i % 50}`, volunteerId: `v${i}`, status: i % 7 === 0 ? "waiting" : "active",
      volunteer: counted({ firstName: `P${i}`, lastName: "Nom", birthDate: null, erasedAt: null, mergedIntoId: null }),
    }))
    const choices = new Map<string, StoredRosterChoice>(registrations.map((r, i) => [`v${i}`, { status: i % 2 ? "visible" : "hidden", noticeVersion: ROSTER_NOTICE_VERSION }]))
    reads = 0
    const out = buildShiftRoster({ viewerId: "v3", shifts, registrations, choices, audience: "confirmed", eventStart: "2099-10-01" })
    return { reads, out }
  }

  it("the same reads for 50 shifts or 2,000 (the extra ones empty), at most a few per registration", () => {
    const few = run(50, 1000)
    const many = run(2000, 1000)
    expect(many.out).toEqual(few.out)
    expect(many.reads).toBe(few.reads)
    expect(few.reads).toBeLessThanOrEqual(12 * 1000)
  })
})

describe("the organisers' short texts (#1068)", () => {
  it("one sentence each; the details are behind « En savoir plus »", () => {
    expect(ROSTER_SETTING_HINT).toBe("Les bénévoles confirmés et les membres invités voient le prénom et l'initiale de ceux qui l'acceptent.")
    expect(ROSTER_PUBLISH_NOTE_ON).toBe("« Qui est inscrit » est activé : prévenez vos bénévoles.")
    expect(ROSTER_PUBLISH_NOTE).toContain("ne change rien à la publication")
    expect(ROSTER_ORG_DEFAULT_HINT).toContain("créés ensuite")
    for (const href of Object.values(ROSTER_DOC_LINKS)) expect(href).toMatch(/^\/doc\/[a-z-]+#[a-z-]+$/)
  })
})
