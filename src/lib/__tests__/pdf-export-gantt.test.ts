import { describe, it, expect } from "vitest"
import { buildDayParts, type ShiftRow } from "../pdf-export-gantt"

function shift(overrides: Partial<ShiftRow> & Pick<ShiftRow, "id" | "roleName" | "startTime" | "endTime">): ShiftRow {
  return {
    label: overrides.roleName,
    date: new Date("2026-07-10"),
    capacity: 5,
    status: "open",
    displayOrder: 0,
    registrations: [],
    waitlistEntries: [],
    ...overrides,
  }
}

describe("buildDayParts (PDF export)", () => {
  it("bounds the day range to the shifts' own start/end, not 00:00-24:00 (#221 regression)", () => {
    const shifts = [shift({ id: "1", roleName: "Bar", startTime: "18:00", endTime: "23:30" })]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    // Hour markers only appear for hours actually in range — 00h/01h.../23h would all be present
    // for a full-day export, so their absence here proves the range is bounded.
    expect(gantt).toContain(">18h<")
    expect(gantt).not.toContain(">00h<")
    expect(gantt).not.toContain(">05h<")
  })

  it("still bounds the range correctly when an overnight shift is on the same day (#221)", () => {
    // An overnight shift's end ("02:00") is numerically smaller than its own start (1320 min) —
    // buildDayParts must roll it forward (+1440) via toMinEnd, not treat 02:00 as an early-morning
    // anchor that drags the whole day's range back down to 00:00.
    const shifts = [
      shift({ id: "1", roleName: "Sécurité", startTime: "22:00", endTime: "02:00" }),
      shift({ id: "2", roleName: "Bar", startTime: "18:00", endTime: "23:00" }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    expect(gantt).toContain(">18h<")
    // The day should not have been dragged back to start at midnight because of the overnight
    // shift's raw (small) end-time value.
    expect(gantt).not.toContain(">00h<")
  })

  it("orders roles by the admin's stored displayOrder, not first chronological appearance (#222 regression)", () => {
    // "Sécurité" starts earlier in the day than "Bar" but was explicitly reordered to come
    // *after* it (displayOrder 100 vs 0) — the Gantt's role-cell order must follow that, even
    // though a naive first-appearance scan (sorted by startTime upstream) would see Sécurité first.
    const shifts = [
      shift({ id: "1", roleName: "Sécurité", startTime: "08:00", endTime: "10:00", displayOrder: 100 }),
      shift({ id: "2", roleName: "Bar", startTime: "18:00", endTime: "20:00", displayOrder: 0 }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    const barIndex = gantt.indexOf(">Bar<")
    const secuIndex = gantt.indexOf(">Sécurité<")
    expect(barIndex).toBeGreaterThan(-1)
    expect(secuIndex).toBeGreaterThan(-1)
    expect(barIndex).toBeLessThan(secuIndex)
  })

  it("falls back to first appearance when roles were never reordered (displayOrder all 0)", () => {
    const shifts = [
      shift({ id: "1", roleName: "Accueil", startTime: "08:00", endTime: "10:00" }),
      shift({ id: "2", roleName: "Bar", startTime: "18:00", endTime: "20:00" }),
    ]
    const { gantt } = buildDayParts(new Date("2026-07-10"), shifts, [], false)
    const accueilIndex = gantt.indexOf(">Accueil<")
    const barIndex = gantt.indexOf(">Bar<")
    expect(accueilIndex).toBeLessThan(barIndex)
  })
})
