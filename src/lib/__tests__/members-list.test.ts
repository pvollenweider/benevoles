import { describe, it, expect } from "vitest"
import { addressesToVerifyCount, archivedCount, filterMembers, nextSort, parseTags, sortAnnouncement, sortMembers } from "../members-list"
import type { AddressStatusView } from "../address-status"

const m = (
  id: string,
  over: Partial<{
    firstName: string; lastName: string; email: string | null; phone: string | null; tags: string[]; active: boolean
    hoursTotal: number; hoursAttested: number; lastShiftDate: string | null; lastPresenceDate: string | null
    addressStatus: AddressStatusView
  }> = {},
) => ({
  id, firstName: "Alice", lastName: "Martin", email: null, phone: null, tags: [], active: true,
  hoursTotal: 0, hoursAttested: 0, lastShiftDate: null, lastPresenceDate: null,
  addressStatus: { kind: "ok" as const }, ...over,
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

  it("filters to members whose address needs checking (#599)", () => {
    const withStatus = [
      m("a", { addressStatus: { kind: "to_verify", since: "2026-01-01T00:00:00.000Z" } }),
      m("b", { addressStatus: { kind: "temporary_incident", since: "2026-01-01T00:00:00.000Z" } }),
      m("c", { addressStatus: { kind: "ok" } }),
    ]
    expect(filterMembers(withStatus, { ...all, addressToVerify: true }).map((x) => x.id)).toEqual(["a"])
    expect(filterMembers(withStatus, { ...all, addressToVerify: false }).map((x) => x.id)).toEqual(["a", "b", "c"])
  })
})

describe("addressesToVerifyCount", () => {
  it("counts only members whose latest status is « to verify »", () => {
    const withStatus = [
      m("a", { addressStatus: { kind: "to_verify", since: "2026-01-01T00:00:00.000Z" } }),
      m("b", { addressStatus: { kind: "temporary_incident", since: "2026-01-01T00:00:00.000Z" } }),
      m("c", { addressStatus: { kind: "to_verify", since: "2026-01-02T00:00:00.000Z" } }),
    ]
    expect(addressesToVerifyCount(withStatus)).toBe(2)
    expect(addressesToVerifyCount(members)).toBe(0)
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
    expect(sortAnnouncement({ col: "hoursTotal", dir: "desc" })).toBe("Trié par heures prévues, décroissant")
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

// #1014: absorbed and erased records have their own toggle, apart from « Inclure inactifs ».
describe("absorbed and erased records", () => {
  const merged = { ...m("t", { firstName: "", lastName: "", active: false }), record: { kind: "merged" as const, keptId: "a", keptName: "Élodie Zbinden", deletionDay: "2026-11-14" } }
  const erased = { ...m("e", { firstName: "Bénévole", lastName: "effacé", active: false, hoursTotal: 99 }), record: { kind: "erased" as const, erasedDay: "2026-03-03" } }
  const list = [...members, merged, erased]
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

  it("are hidden by default, and « Inclure inactifs » does not bring them back", () => {
    expect(ids(filterMembers(list, all))).toEqual(["a", "b"])
    expect(ids(filterMembers(list, { ...all, showInactive: true }))).toEqual(["a", "b", "c"])
  })

  it("their own toggle adds them, independently of the inactive one", () => {
    expect(ids(filterMembers(list, { ...all, showArchived: true }))).toEqual(["a", "b", "t", "e"])
    expect(ids(filterMembers(list, { ...all, showInactive: true, showArchived: true }))).toEqual(["a", "b", "c", "t", "e"])
  })

  it("an explicit ordinary record behaves like one without a record", () => {
    const ordinary = { ...m("o", { active: false }), record: { kind: "ordinary" as const } }
    expect(ids(filterMembers([ordinary], { ...all, showInactive: true }))).toEqual(["o"])
  })

  it("stay after the ordinary records whatever the sort", () => {
    const shown = filterMembers(list, { ...all, showInactive: true, showArchived: true })
    expect(ids(sortMembers(shown, { col: "firstName", dir: "asc" })).slice(-2).sort()).toEqual(["e", "t"])
    expect(ids(sortMembers(shown, { col: "hoursTotal", dir: "desc" })).slice(-2).sort()).toEqual(["e", "t"])
  })

  it("are counted for their filter's label", () => {
    expect(archivedCount(list)).toBe(2)
    expect(archivedCount(members)).toBe(0)
  })
})
