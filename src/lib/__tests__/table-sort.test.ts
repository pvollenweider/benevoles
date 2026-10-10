import { describe, it, expect } from "vitest"
import { nextSort, parseSortParam, sortAnnouncement, sortParam, sortRows, urlWithSort, type SortValue } from "../table-sort"

// Sortable super admin tables (#820): the shared sort rules.

type Row = { id: string; name: string | null; n: number | null; at: string | null }
const key = (r: Row, col: "name" | "n" | "at"): SortValue => r[col]
const ids = (rows: Row[]) => rows.map((r) => r.id)

describe("nextSort", () => {
  it("goes ascending, descending, then back to the page's order", () => {
    let s = nextSort<"a" | "b">({ col: null, dir: "asc" }, "a")
    expect(s).toEqual({ col: "a", dir: "asc" })
    s = nextSort(s, "a")
    expect(s).toEqual({ col: "a", dir: "desc" })
    expect(nextSort(s, "a")).toEqual({ col: null, dir: "asc" })
  })
  it("starts ascending on another column", () => {
    expect(nextSort<"a" | "b">({ col: "a", dir: "desc" }, "b")).toEqual({ col: "b", dir: "asc" })
  })
})

describe("sortRows", () => {
  const rows: Row[] = [
    { id: "1", name: "Zoé", n: 10, at: "2026-03-01T10:00:00.000Z" },
    { id: "2", name: "élodie", n: 2, at: "2025-12-31T23:00:00.000Z" },
    { id: "3", name: "Éric", n: 2, at: null },
    { id: "4", name: "adèle", n: null, at: "2026-01-15T08:00:00.000Z" },
    { id: "5", name: null, n: 30, at: "2026-01-15T08:00:00.000Z" },
  ]

  it("leaves the page's order without a sort", () => {
    expect(sortRows(rows, { col: null, dir: "asc" }, key)).toBe(rows)
  })

  it("sorts names in French collation, accents and case aside", () => {
    expect(ids(sortRows(rows, { col: "name", dir: "asc" }, key))).toEqual(["4", "2", "3", "1", "5"])
    expect(ids(sortRows(rows, { col: "name", dir: "desc" }, key))).toEqual(["1", "3", "2", "4", "5"])
  })

  it("sorts numbers as numbers, not as text", () => {
    expect(ids(sortRows(rows, { col: "n", dir: "asc" }, key))).toEqual(["2", "3", "1", "5", "4"])
    expect(ids(sortRows(rows, { col: "n", dir: "desc" }, key))).toEqual(["5", "1", "2", "3", "4"])
  })

  it("keeps the page's order between equal values, in both directions", () => {
    const desc = ids(sortRows(rows, { col: "n", dir: "desc" }, key))
    expect(desc.indexOf("2")).toBeLessThan(desc.indexOf("3"))
    const byDate = ids(sortRows(rows, { col: "at", dir: "desc" }, key))
    expect(byDate.indexOf("4")).toBeLessThan(byDate.indexOf("5"))
  })

  it("sorts ISO dates in time order", () => {
    expect(ids(sortRows(rows, { col: "at", dir: "asc" }, key))).toEqual(["2", "4", "5", "1", "3"])
  })

  it("puts empty values last in either direction", () => {
    expect(ids(sortRows(rows, { col: "at", dir: "asc" }, key)).at(-1)).toBe("3")
    expect(ids(sortRows(rows, { col: "at", dir: "desc" }, key)).at(-1)).toBe("3")
  })

  it("orders numbers inside texts naturally", () => {
    const r = ["Vidéo 10", "Vidéo 2", "vidéo 1"].map((name, i) => ({ id: String(i), name, n: 0, at: null }))
    expect(sortRows(r, { col: "name", dir: "asc" }, key).map((x) => x.name)).toEqual(["vidéo 1", "Vidéo 2", "Vidéo 10"])
  })

  it("does not change the rows it was given", () => {
    const copy = [...rows]
    sortRows(rows, { col: "n", dir: "asc" }, key)
    expect(rows).toEqual(copy)
  })
})

describe("sort in the URL", () => {
  const cols = ["nom", "membres"] as const

  it("writes and reads back a sort", () => {
    expect(sortParam({ col: "membres", dir: "desc" })).toBe("membres-desc")
    expect(parseSortParam("membres-desc", cols)).toEqual({ col: "membres", dir: "desc" })
    expect(parseSortParam(["nom-asc", "membres-desc"], cols)).toEqual({ col: "nom", dir: "asc" })
  })

  it("ignores an unknown column or direction", () => {
    for (const v of [undefined, null, "", "membres", "slug-asc", "membres-up", "-asc"]) {
      expect(parseSortParam(v, cols)).toEqual({ col: null, dir: "asc" })
    }
  })

  it("replaces or removes ?tri= and keeps the other parameters", () => {
    expect(urlWithSort("https://x.test/super-admin/organizations?a=1", { col: "nom", dir: "asc" })).toBe("/super-admin/organizations?a=1&tri=nom-asc")
    expect(urlWithSort("https://x.test/p?tri=nom-asc&a=1#h", { col: "membres", dir: "desc" })).toBe("/p?tri=membres-desc&a=1#h")
    expect(urlWithSort("https://x.test/p?tri=nom-asc", { col: null, dir: "asc" })).toBe("/p")
  })
})

describe("sortAnnouncement", () => {
  const labels = { nom: "nom", membres: "membres" }
  it("says the column and the direction in words", () => {
    expect(sortAnnouncement({ col: "membres", dir: "desc" }, labels)).toBe("Trié par membres, décroissant")
    expect(sortAnnouncement({ col: "nom", dir: "asc" }, labels)).toBe("Trié par nom, croissant")
    expect(sortAnnouncement({ col: null, dir: "asc" }, labels)).toBe("Tri réinitialisé : ordre d'origine")
  })
})
