import { describe, it, expect } from "vitest"
import { filterMembers, nextSort, parseTags, sortAnnouncement, sortMembers } from "../members-list"

const m = (
  id: string,
  over: Partial<{
    firstName: string; lastName: string; email: string | null; phone: string | null; tags: string[]; active: boolean
    hoursTotal: number; hoursAttested: number; lastShiftDate: string | null; lastPresenceDate: string | null
  }> = {},
) => ({
  id, firstName: "Alice", lastName: "Martin", email: null, phone: null, tags: [], active: true,
  hoursTotal: 0, hoursAttested: 0, lastShiftDate: null, lastPresenceDate: null, ...over,
})

const members = [
  m("a", { firstName: "Élodie", lastName: "Zbinden", email: "elodie@x.ch", tags: ["bar"], hoursTotal: 12 }),
  m("b", { firstName: "bob", lastName: "Durand", phone: "079 123 45 67", hoursTotal: 3 }),
  m("c", { firstName: "Claire", lastName: "Aubert", active: false, tags: ["bar"], hoursTotal: 7 }),
]
const all = { search: "", tag: "", showInactive: false }

describe("filterMembers", () => {
  it("ignores accents and case (#390)", () => {
    const zoe = { ...members[0], id: "z", firstName: "Zoé", lastName: "Roy" }
    expect(filterMembers([zoe], { ...all, search: "zoe" }).map((x) => x.id)).toEqual(["z"])
    expect(filterMembers([zoe], { ...all, search: "ROY" }).map((x) => x.id)).toEqual(["z"])
  })

  it("hides inactive members unless asked", () => {
    expect(filterMembers(members, all).map((x) => x.id)).toEqual(["a", "b"])
    expect(filterMembers(members, { ...all, showInactive: true })).toHaveLength(3)
  })

  it("searches name, email and phone, case-insensitive and trimmed", () => {
    expect(filterMembers(members, { ...all, search: " ZBIN " }).map((x) => x.id)).toEqual(["a"])
    expect(filterMembers(members, { ...all, search: "elodie@" }).map((x) => x.id)).toEqual(["a"])
    expect(filterMembers(members, { ...all, search: "079 123" }).map((x) => x.id)).toEqual(["b"])
    expect(filterMembers(members, { ...all, search: "nobody" })).toEqual([])
  })

  it("matches the full name, as linked from the global search for a member without email", () => {
    expect(filterMembers(members, { ...all, search: "Bob Durand" }).map((x) => x.id)).toEqual(["b"])
  })

  it("filters by tag, combined with the inactive toggle", () => {
    expect(filterMembers(members, { ...all, tag: "bar" }).map((x) => x.id)).toEqual(["a"])
    expect(filterMembers(members, { ...all, tag: "bar", showInactive: true }).map((x) => x.id)).toEqual(["a", "c"])
  })
})

describe("sorting", () => {
  it("cycles ascending, descending, then no sort; another column starts ascending", () => {
    const s1 = nextSort({ col: null, dir: "asc" }, "lastName")
    expect(s1).toEqual({ col: "lastName", dir: "asc" })
    const s2 = nextSort(s1, "lastName")
    expect(s2).toEqual({ col: "lastName", dir: "desc" })
    expect(nextSort(s2, "lastName")).toEqual({ col: null, dir: "asc" })
    expect(nextSort(s2, "hoursTotal")).toEqual({ col: "hoursTotal", dir: "asc" })
  })

  it("announces the sort for screen readers", () => {
    expect(sortAnnouncement({ col: "firstName", dir: "asc" })).toBe("Trié par prénom, croissant")
    expect(sortAnnouncement({ col: "hoursTotal", dir: "desc" })).toBe("Trié par heures planifiées, décroissant")
    expect(sortAnnouncement({ col: null, dir: "asc" })).toBe("Tri réinitialisé")
  })

  it("sorts names case-insensitively with French collation, and hours numerically", () => {
    expect(sortMembers(members, { col: "firstName", dir: "asc" }).map((x) => x.id)).toEqual(["b", "c", "a"])
    expect(sortMembers(members, { col: "lastName", dir: "desc" }).map((x) => x.id)).toEqual(["a", "b", "c"])
    expect(sortMembers(members, { col: "hoursTotal", dir: "asc" }).map((x) => x.id)).toEqual(["b", "c", "a"])
  })

  it("sorts attested hours numerically and last participation by date, nulls first ascending (#557)", () => {
    const withDates = [
      m("x", { lastShiftDate: "2026-05-01", hoursAttested: 2 }),
      m("y", { lastShiftDate: null, hoursAttested: 9 }),
      m("z", { lastShiftDate: "2026-01-10", hoursAttested: 1 }),
    ]
    expect(sortMembers(withDates, { col: "hoursAttested", dir: "desc" }).map((x) => x.id)).toEqual(["y", "x", "z"])
    expect(sortMembers(withDates, { col: "lastShiftDate", dir: "asc" }).map((x) => x.id)).toEqual(["y", "z", "x"])
    expect(sortMembers(withDates, { col: "lastShiftDate", dir: "desc" }).map((x) => x.id)).toEqual(["x", "z", "y"])
  })

  it("keeps the order without a sort, and never mutates the input", () => {
    const copy = [...members]
    expect(sortMembers(members, { col: null, dir: "asc" })).toBe(members)
    sortMembers(members, { col: "hoursTotal", dir: "desc" })
    expect(members).toEqual(copy)
  })
})

describe("parseTags", () => {
  it("splits on commas, trims and drops empty entries", () => {
    expect(parseTags("bénévole, bar, ")).toEqual(["bénévole", "bar"])
    expect(parseTags(" parent CM2 ,,bar")).toEqual(["parent CM2", "bar"])
    expect(parseTags("")).toEqual([])
  })
})
