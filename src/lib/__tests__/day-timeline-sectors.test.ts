import { describe, it, expect } from "vitest"
import { GAP, LANE_GAP, layoutSectorGroups, SECTOR_H } from "../day-timeline"

// The admin timeline grouped by sector (#1147): a header per group, then its postes unless collapsed.
describe("layoutSectorGroups", () => {
  const heights = { A: 56, B: 116, C: 56 }

  it("stacks each group's header then its postes", () => {
    const { groups, roleTop, rowsH } = layoutSectorGroups([{ key: "p", roles: ["A", "B"] }, { key: "none", roles: ["C"] }], heights, new Set())
    expect(roleTop.A).toBe(SECTOR_H + LANE_GAP)
    expect(roleTop.B).toBe(SECTOR_H + LANE_GAP + 56 + GAP)
    expect(groups[1].top).toBe(groups[0].height)
    expect(rowsH).toBe(2 * (SECTOR_H + LANE_GAP) + 56 + 116 + 56 + 3 * GAP)
  })

  it("draws no row for a collapsed group, only its header", () => {
    const { groups, roleTop, rowsH } = layoutSectorGroups([{ key: "p", roles: ["A", "B"] }, { key: "none", roles: ["C"] }], heights, new Set(["p"]))
    expect(groups[0].roles).toEqual([])
    expect(roleTop.A).toBeUndefined()
    expect(roleTop.C).toBe(2 * (SECTOR_H + LANE_GAP))
    expect(rowsH).toBe(2 * (SECTOR_H + LANE_GAP) + 56 + GAP)
  })
})
