import { describe, it, expect } from "vitest"
import { friseKey, friseTabStop, friseTarget, type FriseRows } from "../frise-keyboard"

// Three postes: Bar has three bars (one on a second lane), Accueil one long bar, Caisse two.
const rows: FriseRows = [
  [{ id: "bar1", start: 480, end: 600 }, { id: "bar2", start: 540, end: 660 }, { id: "bar3", start: 600, end: 720 }],
  [{ id: "acc", start: 480, end: 1080 }],
  [{ id: "cai1", start: 600, end: 660 }, { id: "cai2", start: 840, end: 960 }],
]

const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; isComposing: boolean }> = {}) =>
  friseKey({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods })

describe("friseTarget (#1075)", () => {
  it("Left and Right stay in the row, in reading order, without wrapping", () => {
    expect(friseTarget(rows, "bar1", "ArrowRight")).toBe("bar2")
    expect(friseTarget(rows, "bar2", "ArrowRight")).toBe("bar3")
    expect(friseTarget(rows, "bar3", "ArrowRight")).toBeNull()
    expect(friseTarget(rows, "bar2", "ArrowLeft")).toBe("bar1")
    expect(friseTarget(rows, "bar1", "ArrowLeft")).toBeNull()
  })

  it("Up and Down go to the adjacent row, to the bar sharing the most time", () => {
    expect(friseTarget(rows, "bar3", "ArrowDown")).toBe("acc")
    // From the long Accueil bar: Caisse 14h–16h shares 120 min, 10h–11h only 60.
    expect(friseTarget(rows, "acc", "ArrowDown")).toBe("cai2")
    // From Caisse 10h–11h up: Accueil, the only bar of its row.
    expect(friseTarget(rows, "cai1", "ArrowUp")).toBe("acc")
    // From Accueil up: bar1, bar2 and bar3 share 120 min each; bar1 starts at the same time.
    expect(friseTarget(rows, "acc", "ArrowUp")).toBe("bar1")
    expect(friseTarget(rows, "bar1", "ArrowUp")).toBeNull()
    expect(friseTarget(rows, "cai2", "ArrowDown")).toBeNull()
  })

  it("without shared time, the closest start, then the earlier bar", () => {
    const apart: FriseRows = [
      [{ id: "a", start: 600, end: 660 }],
      [{ id: "early", start: 480, end: 540 }, { id: "late", start: 720, end: 780 }, { id: "near", start: 690, end: 700 }],
    ]
    expect(friseTarget(apart, "a", "ArrowDown")).toBe("near")
    const tie: FriseRows = [[{ id: "a", start: 600, end: 660 }], [{ id: "before", start: 480, end: 540 }, { id: "after", start: 720, end: 780 }]]
    expect(friseTarget(tie, "a", "ArrowDown")).toBe("before")
  })

  it("Home and End go to the ends of the row; with Ctrl, of the day", () => {
    expect(friseTarget(rows, "bar2", "Home")).toBe("bar1")
    expect(friseTarget(rows, "bar2", "End")).toBe("bar3")
    expect(friseTarget(rows, "cai1", "End")).toBe("cai2")
    expect(friseTarget(rows, "bar2", "End", true)).toBe("cai2")
    expect(friseTarget(rows, "cai2", "Home", true)).toBe("bar1")
    // Already there: nothing to move.
    expect(friseTarget(rows, "bar1", "Home")).toBeNull()
    expect(friseTarget(rows, "acc", "End")).toBeNull()
  })

  it("skips empty rows and ignores an unknown bar", () => {
    expect(friseTarget([[{ id: "a", start: 0, end: 60 }], [], [{ id: "b", start: 0, end: 60 }]], "a", "ArrowDown")).toBe("b")
    expect(friseTarget(rows, "gone", "ArrowRight")).toBeNull()
  })
})

describe("friseKey (#1075)", () => {
  it("handles the arrows, Home and End, and Ctrl only with Home and End", () => {
    expect(key("ArrowRight")).toEqual({ key: "ArrowRight", ctrl: false })
    expect(key("End", { ctrlKey: true })).toEqual({ key: "End", ctrl: true })
    expect(key("ArrowDown", { ctrlKey: true })).toBeNull()
  })

  it("leaves other keys and modified keys to the browser", () => {
    for (const k of ["Enter", " ", "Tab", "a", "PageDown"]) expect(key(k)).toBeNull()
    expect(key("ArrowLeft", { altKey: true })).toBeNull()
    expect(key("ArrowLeft", { metaKey: true })).toBeNull()
    expect(key("ArrowLeft", { shiftKey: true })).toBeNull()
    expect(key("ArrowLeft", { isComposing: true })).toBeNull()
  })
})

describe("friseTabStop (#1075)", () => {
  const order = ["full", "open", "other"]
  it("the bar focused last while it is drawn, else the first that can be chosen, else the first", () => {
    expect(friseTabStop(order, new Set(["open", "other"]), "other")).toBe("other")
    expect(friseTabStop(order, new Set(["open", "other"]), "cancelled")).toBe("open")
    expect(friseTabStop(order, new Set(["open"]), null)).toBe("open")
    expect(friseTabStop(order, new Set(), null)).toBe("full")
    expect(friseTabStop([], new Set(), null)).toBeNull()
  })
})
