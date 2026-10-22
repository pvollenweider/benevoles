import { createHash } from "node:crypto"
import { describe, it, expect } from "vitest"
import type { RosterRegistration, RosterShift, StoredRosterChoice } from "../shift-roster"

/**
 * Byte-for-byte record of the shift roster's public functions and texts (#1068), so that moving
 * them between modules or reworking their internals cannot change what a volunteer or an organiser
 * reads, nor what the roster routes answer. The modules are loaded by pattern (every
 * src/lib/shift-roster*.ts), so the record does not depend on which file holds which export. A
 * failing snapshot after an intended copy or rule change: review the diff, then update with
 * `npx vitest run -u`.
 */

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>
  }
}

type Api = Record<string, unknown>
const modules = import.meta.glob<Api>("../shift-roster*.ts", { eager: true })
const api: Api = Object.assign({}, ...Object.keys(modules).sort().map((k) => modules[k]))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = (name: string) => api[name] as (...args: any[]) => any

const V1 = "2026-10-21"
const V2 = "2026-10-21.2"
const EVENT_START = new Date("2099-10-01T00:00:00Z")

type Vol = RosterRegistration["volunteer"]
const person = (firstName: string, lastName: string, more: Partial<Vol> = {}): Vol => ({ firstName, lastName, birthDate: null, erasedAt: null, mergedIntoId: null, ...more })

/** Everyone a roster can meet: each kind of choice, text version, age, record state and name. */
const PEOPLE: Record<string, { v: Vol; choice?: StoredRosterChoice }> = {
  me: { v: person("Moi", "Même"), choice: { status: "visible", noticeVersion: V2 } },
  aline: { v: person("Aline", "Martin"), choice: { status: "visible", noticeVersion: V2 } },
  odile: { v: person("Odile", "Ancien"), choice: { status: "visible", noticeVersion: V1 } },
  unknownText: { v: person("Ursula", "Inconnue"), choice: { status: "visible", noticeVersion: "1999-01-01" } },
  bruno: { v: person("Bruno", "Keller"), choice: { status: "pending", noticeVersion: V2 } },
  chloe: { v: person("Chloé", "Roux"), choice: { status: "hidden", noticeVersion: V2 } },
  nochoice: { v: person("Nina", "Sanschoix") },
  minor: { v: person("Max", "Mineur", { birthDate: new Date("2085-01-01T00:00:00Z") }), choice: { status: "visible", noticeVersion: V2 } },
  justAdult: { v: person("Jade", "Majeure", { birthDate: "2081-10-01" }), choice: { status: "visible", noticeVersion: V2 } },
  justMinor: { v: person("Jules", "Presque", { birthDate: "2081-10-02" }), choice: { status: "visible", noticeVersion: V2 } },
  adult: { v: person("Adam", "Adulte", { birthDate: new Date("1990-05-05T00:00:00Z") }), choice: { status: "visible", noticeVersion: V1 } },
  badBirth: { v: person("Basile", "Illisible", { birthDate: "pas une date" }), choice: { status: "visible", noticeVersion: V2 } },
  erased: { v: person("Eric", "Efface", { erasedAt: new Date("2026-01-01T00:00:00Z") }), choice: { status: "visible", noticeVersion: V2 } },
  merged: { v: person("Mona", "Fusion", { mergedIntoId: "aline" }), choice: { status: "visible", noticeVersion: V2 } },
  noFirst: { v: person("  ", "Sansprenom"), choice: { status: "visible", noticeVersion: V2 } },
  noLast: { v: person("Solo", ""), choice: { status: "visible", noticeVersion: V2 } },
  spaced: { v: person("  Jean   Paul ", "  dupont "), choice: { status: "visible", noticeVersion: V2 } },
  lea1: { v: person("Léa", "Favre"), choice: { status: "visible", noticeVersion: V2 } },
  lea2: { v: person("Léa", "Fontaine"), choice: { status: "visible", noticeVersion: V2 } },
  emile: { v: person("Émile", "Zola"), choice: { status: "visible", noticeVersion: V2 } },
  eve: { v: person("eve", "éluard"), choice: { status: "visible", noticeVersion: V2 } },
  zoe: { v: person("Zoé", "Ôde"), choice: { status: "visible", noticeVersion: V2 } },
  ana: { v: person("Ana", "𝒜stral"), choice: { status: "visible", noticeVersion: V2 } },
  waiter: { v: person("Wanda", "Waiting"), choice: { status: "visible", noticeVersion: V2 } },
}

const day1 = new Date("2099-10-01T00:00:00Z")
const SHIFTS: RosterShift[] = [
  { id: "bar", label: "Bar", date: day1, startTime: "10:00", endTime: "12:00" },
  { id: "accueil", label: "Accueil", date: "2099-10-01", startTime: "14:00", endTime: "16:00" },
  { id: "empty", label: "Vide", date: day1, startTime: "08:00", endTime: "09:00" },
  { id: "meOnly", label: "Seul", date: "2099-10-02T00:00:00.000Z", startTime: "09:00", endTime: "10:00" },
  { id: "waitOnly", label: "Attente", date: day1, startTime: "18:00", endTime: "20:00" },
  { id: "hiddenOnly", label: "Discret", date: day1, startTime: "20:00", endTime: "22:00" },
  { id: "meWaiting", label: "Liste d'attente", date: day1, startTime: "22:00", endTime: "23:00" },
  { id: "names", label: "Tri des noms", date: new Date("2099-10-02T00:00:00Z"), startTime: "10:00", endTime: "11:00" },
  // The same shift twice in the list: both kept, in order.
  { id: "accueil", label: "Accueil", date: "2099-10-01", startTime: "14:00", endTime: "16:00" },
]

const reg = (shiftId: string, volunteerId: string, status = "active"): RosterRegistration => ({ shiftId, volunteerId, status, volunteer: PEOPLE[volunteerId].v })
const REGISTRATIONS: RosterRegistration[] = [
  reg("bar", "me"), reg("bar", "aline"), reg("bar", "odile"), reg("bar", "unknownText"), reg("bar", "bruno"), reg("bar", "chloe"),
  reg("bar", "nochoice"), reg("bar", "minor"), reg("bar", "justAdult"), reg("bar", "justMinor"), reg("bar", "adult"), reg("bar", "badBirth"),
  reg("bar", "erased"), reg("bar", "merged"), reg("bar", "noFirst"), reg("bar", "waiter", "waiting"),
  // The same volunteer twice on a shift: one place.
  reg("bar", "aline"), reg("bar", "chloe"),
  reg("accueil", "odile"), reg("accueil", "noLast"), reg("accueil", "spaced"), reg("accueil", "bruno", "pending"),
  reg("meOnly", "me"),
  reg("waitOnly", "waiter", "waiting"), reg("waitOnly", "aline", "cancelled"),
  reg("hiddenOnly", "chloe"), reg("hiddenOnly", "nochoice"), reg("hiddenOnly", "merged"),
  reg("meWaiting", "me", "waiting"), reg("meWaiting", "odile"),
  reg("names", "zoe"), reg("names", "lea2"), reg("names", "eve"), reg("names", "emile"), reg("names", "lea1"), reg("names", "ana"), reg("names", "aline"),
  // A shift that is not in the list (cancelled, another event's): never shown.
  reg("elsewhere", "aline"),
]
const CHOICES = new Map(Object.entries(PEOPLE).flatMap(([id, p]) => (p.choice ? [[id, p.choice] as const] : [])))

/** A large, deterministic event: many shifts, many volunteers, every kind of choice. */
function manyShifts(shiftCount: number, volunteerCount: number, registrationCount: number) {
  let seed = 1068
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  const firsts = ["Aline", "Bruno", "Chloé", "Émile", "eve", "Léa", "Zoé", "Ana", "Jean Paul", "Ôscar"]
  const lasts = ["Martin", "Keller", "Roux", "éluard", "Favre", "Fontaine", "Ôde", ""]
  const statuses = ["visible", "visible", "pending", "hidden"] as const
  const versions = [V2, V2, V1, "x"]
  const volunteers = Array.from({ length: volunteerCount }, (_, i) => {
    const kind = rand(20)
    return {
      id: `v${i}`,
      v: person(firsts[rand(firsts.length)], lasts[rand(lasts.length)], {
        birthDate: kind === 0 ? "2090-01-01" : kind === 1 ? "1980-01-01" : null,
        erasedAt: kind === 2 ? "2026-01-01" : null,
        mergedIntoId: kind === 3 ? "v0" : null,
      }),
      choice: kind === 4 ? undefined : { status: statuses[rand(4)], noticeVersion: versions[rand(4)] },
    }
  })
  const shifts: RosterShift[] = Array.from({ length: shiftCount }, (_, i) => ({ id: `s${i}`, label: `Créneau ${i}`, date: new Date(Date.UTC(2099, 9, 1 + (i % 3))), startTime: `${String(8 + (i % 12)).padStart(2, "0")}:00`, endTime: `${String(9 + (i % 12)).padStart(2, "0")}:00` }))
  const regStatuses = ["active", "active", "active", "waiting", "pending"]
  const registrations: RosterRegistration[] = Array.from({ length: registrationCount }, () => {
    const v = volunteers[rand(volunteers.length)]
    return { shiftId: `s${rand(shiftCount + 2)}`, volunteerId: v.id, status: regStatuses[rand(regStatuses.length)], volunteer: v.v }
  })
  const choices = new Map(volunteers.flatMap((v) => (v.choice ? [[v.id, v.choice] as const] : [])))
  return { shifts, registrations, choices }
}

const build = (input: Record<string, unknown>) => fn("buildShiftRoster")({ eventStart: EVENT_START, ...input })

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

describe("shift roster characterization (#1068)", () => {
  it("exports the same names and the same texts and numbers", () => {
    const names = Object.keys(api).sort()
    expect(names).toMatchSnapshot()
    const values = Object.fromEntries(names.filter((n) => typeof api[n] === "string" || typeof api[n] === "number").map((n) => [n, api[n]]))
    expect(values).toMatchSnapshot()
    expect(fingerprint(values)).toMatchSnapshot()
  })

  it("buildShiftRoster: every viewer and audience over the representative event", () => {
    const out: Record<string, unknown> = {}
    for (const viewerId of ["me", "aline", "nobody"]) {
      for (const audience of ["confirmed", "invited"]) {
        out[`${viewerId}/${audience}`] = build({ viewerId, shifts: SHIFTS, registrations: REGISTRATIONS, choices: CHOICES, audience })
      }
    }
    // The event's first day as a string, and no choices at all.
    out["me/confirmed/string start"] = build({ viewerId: "me", shifts: SHIFTS, registrations: REGISTRATIONS, choices: CHOICES, audience: "confirmed", eventStart: "2099-10-01" })
    out["me/confirmed/no choices"] = build({ viewerId: "me", shifts: SHIFTS, registrations: REGISTRATIONS, choices: new Map(), audience: "confirmed" })
    expect(out).toMatchSnapshot()
    expect(fingerprint(out)).toMatchSnapshot()
  })

  it("buildShiftRoster: empty inputs", () => {
    expect([
      build({ viewerId: "me", shifts: [], registrations: REGISTRATIONS, choices: CHOICES, audience: "confirmed" }),
      build({ viewerId: "me", shifts: SHIFTS, registrations: [], choices: CHOICES, audience: "confirmed" }),
      build({ viewerId: "me", shifts: SHIFTS, registrations: [], choices: new Map(), audience: "invited" }),
    ]).toMatchSnapshot()
  })

  it("buildShiftRoster: many shifts", () => {
    const big = manyShifts(40, 80, 600)
    const out = {
      confirmed: build({ viewerId: "v7", ...big, audience: "confirmed" }),
      invited: build({ viewerId: "nobody", ...big, audience: "invited" }),
    }
    expect(out).toMatchSnapshot()
    expect(fingerprint(out)).toMatchSnapshot()
  })

  it("the viewer's state and its sentences, buttons and messages", () => {
    const choices: (StoredRosterChoice | null)[] = [null]
    for (const status of ["visible", "pending", "hidden"] as const) for (const noticeVersion of [V1, V2, "x"]) choices.push({ status, noticeVersion })
    const states = choices.flatMap((c) => [false, true].map((minor) => ({ c, minor, state: fn("viewerState")(c, minor) })))
    const texts = ["visible", "visible_confirmed", "pending", "hidden", "minor"].flatMap((s) =>
      [null, "Aline M.", "Léa F.", "Solo"].map((n) => ({ s, n, text: fn("viewerStateText")(s, n), button: fn("rosterButtonLabel")(s) })))
    const done = ["show", "hide", "widen"].map((a) => fn("rosterDoneText")(a))
    expect({ states, texts, done }).toMatchSnapshot()
  })

  it("names, counts and the shift's sentence, printed and spoken", () => {
    const displayNames = ["Aline M.", "Aline", "Jean Paul D.", "Zoé É.", "A B.", "Léa F.", "Ana 𝒜.", "M.", "Aline M.x", "Aline  M."]
    const formats = displayNames.map((n) => ({ n, visible: fn("rosterVisibleName")(n), spoken: fn("rosterSpokenName")(n) }))
    const pairs = [["Aline", "Martin"], ["  Jean  Paul ", " dupont"], ["Zoé", "Éluard"], ["Aline", "Martin-Durand"], ["Aline", ""], ["  ", "Martin"], ["Ana", "𝒜stral"], ["ﬁona", "ǆ"], ["é", "i"]]
    const display = pairs.map(([f, l]) => ({ f, l, name: fn("rosterDisplayName")(f, l) }))
    const others = [-1, 0, 1, 2, 3.5, NaN, 10].flatMap((c) => [true, false].map((w) => ({ c, w, text: fn("rosterOthersText")(c, w) })))
    const entries = [undefined, { names: [], othersCount: 0 }, { names: [], othersCount: 1 }, { names: [], othersCount: 3 }, { names: ["Aline M."], othersCount: 0 },
      { names: ["Aline M."], othersCount: 1 }, { names: ["Aline M.", "Luc D."], othersCount: 0 }, { names: ["Aline M.", "Luc D.", "Solo"], othersCount: 0 },
      { names: ["Aline M.", "Luc D.", "Zoé É."], othersCount: 2 }]
    const summaries = entries.map((e) => ({
      e,
      plain: fn("rosterSummary")(e),
      visible: fn("rosterSummary")(e, fn("rosterVisibleName")),
      spoken: fn("rosterSummary")(e, fn("rosterSpokenName")),
    }))
    const leads = [true, false].map((own) => fn("rosterLead")(own))
    expect({ formats, display, others, summaries, leads }).toMatchSnapshot()
    expect(fingerprint({ formats, display, others, summaries, leads })).toMatchSnapshot()
  })

  it("consent versions, audiences and choices after a sign-up", () => {
    const versions = [V1, V2, "x", "", null, undefined]
    const reaches = versions.flatMap((v) => ["confirmed", "invited"].map((a) => ({ v, a, ok: fn("noticeReaches")(v, a) })))
    const submitted = [V2, V1, "x", "", null, undefined, 1, {}].map((s) => fn("signupNoticeVersion")(s))
    const isChoice = ["visible", "pending", "hidden", "Visible", "", null, 1].map((v) => fn("isRosterChoice")(v))
    const bools = [false, true]
    const after: unknown[] = []
    for (const stored of [null, "visible", "pending", "hidden"]) for (const requested of bools) for (const verified of bools) for (const minor of bools)
      after.push({ stored, requested, verified, minor, choice: fn("choiceAfterSignup")({ stored, requested, verified, minor }) })
    const storedRows: (StoredRosterChoice | null)[] = [null]
    for (const status of ["visible", "pending", "hidden"] as const) for (const noticeVersion of [V1, V2, "x"]) storedRows.push({ status, noticeVersion })
    const rows: unknown[] = []
    for (const stored of storedRows) for (const requested of bools) for (const verified of bools) for (const minor of bools) for (const noticeVersion of [V1, V2])
      rows.push({ stored, requested, verified, minor, noticeVersion, row: fn("rosterAfterSignup")({ stored, requested, verified, minor, noticeVersion }) })
    expect({ reaches, submitted, isChoice, after, rows }).toMatchSnapshot()
    expect(fingerprint({ reaches, submitted, isChoice, after, rows })).toMatchSnapshot()
  })

  it("minors, the sign-up box, the roster's opening and who may look", () => {
    const births = [null, undefined, "", "2081-10-01", "2081-10-02", "2090-01-01", "1980-01-01", "pas une date", new Date("2085-01-01T00:00:00Z")]
    const starts = [EVENT_START, "2099-10-01", null, undefined, "pas une date"]
    const minors = births.flatMap((b) => starts.map((s) => ({ b, s, minor: fn("isKnownMinor")(b, s) })))
    const boxes = [true, false].flatMap((enabled) => ["", "2090-01-01", "1980-01-01", "2090-1-1", "2081-10-02", "2081-10-01", "abcd-ef-gh"].map((b) => ({ enabled, b, box: fn("signupRosterBox")(enabled, b, EVENT_START) })))
    const now = new Date("2099-10-01T22:30:00Z")
    const open = [
      { shiftRosterEnabled: true, personalDataAnonymizedAt: null, endDate: "2099-10-01" },
      { shiftRosterEnabled: true, personalDataAnonymizedAt: null, endDate: new Date("2099-10-02T00:00:00Z") },
      { shiftRosterEnabled: false, personalDataAnonymizedAt: null, endDate: "2099-10-02" },
      { shiftRosterEnabled: true, personalDataAnonymizedAt: "2099-01-01", endDate: "2099-10-02" },
      { shiftRosterEnabled: true, personalDataAnonymizedAt: null, endDate: "2099-09-30" },
    ].flatMap((e) => ["Europe/Zurich", "UTC", "America/New_York", "Pacific/Kiritimati"].map((tz) => ({ e, tz, open: fn("rosterOpen")(e, now, tz) })))
    const bools = [false, true]
    const viewers: unknown[] = []
    for (const enabled of bools) for (const embed of bools) for (const preview of bools) for (const groupLink of bools) for (const inviteToken of [null, "", "inv"]) for (const sessionToken of [null, "", "ses"])
      viewers.push(fn("eventPageRosterViewer")({ enabled, embed, preview, groupLink, inviteToken, sessionToken }))
    const audiences: unknown[] = []
    for (const active of bools) for (const erased of bools) for (const merged of bools) for (const declined of bools) for (const used of bools) for (const confirmedOnEvent of bools)
      audiences.push(fn("inviteRosterAudience")({ active, erased, merged, declined, used, confirmedOnEvent }))
    const hrefs = ["https://club.benevol.app/fete", "https://club.benevol.app/fete?g=abc", "https://club.benevol.app/fete#creneaux", "https://club.benevol.app/fete?g=abc#x", "/fete", ""].map((u) => fn("rosterEventHref")(u))
    expect({ minors, boxes, open, viewers, audiences, hrefs }).toMatchSnapshot()
    expect(fingerprint({ minors, boxes, open, viewers, audiences, hrefs })).toMatchSnapshot()
  })
})
