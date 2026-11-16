import { describe, it, expect } from "vitest"
import { hidesColumns } from "@/lib/table-overflow"

// #1102: the members table says it scrolls sideways only when columns are really hidden.
describe("hidesColumns", () => {
  it("is false when the table fits its region", () => {
    expect(hidesColumns(990, 990)).toBe(false)
    expect(hidesColumns(800, 990)).toBe(false)
  })

  it("is true when the table is wider than its region (phone, tablet)", () => {
    expect(hidesColumns(975, 341)).toBe(true)
    expect(hidesColumns(975, 734)).toBe(true)
  })

  it("ignores a one-pixel sub-pixel rounding difference", () => {
    expect(hidesColumns(991, 990)).toBe(false)
    expect(hidesColumns(992, 990)).toBe(true)
  })

  it("is false for a region not laid out yet or a bad measure", () => {
    expect(hidesColumns(975, 0)).toBe(false)
    expect(hidesColumns(Number.NaN, 300)).toBe(false)
    expect(hidesColumns(975, Number.NaN)).toBe(false)
  })
})
