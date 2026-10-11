import { describe, expect, it } from "vitest"
import { popoverPlacement } from "../popover-placement"

const inViewport = (p: { top: number; maxHeight: number }, vh: number) =>
  p.top >= 0 && p.top + p.maxHeight <= vh

describe("popoverPlacement", () => {
  it("opens below a bar high on the screen", () => {
    const p = popoverPlacement({ anchorTop: 100, anchorBottom: 148, viewportHeight: 800, contentHeight: 420 })
    expect(p).toEqual({ top: 154, maxHeight: 638, side: "below" })
  })

  it("flips above a bar near the bottom (the autumn shift that overflowed by 82 px)", () => {
    // Before: top 722, maxHeight forced to 160, bottom at 882 in an 800 px viewport.
    const p = popoverPlacement({ anchorTop: 668, anchorBottom: 716, viewportHeight: 800, contentHeight: 420 })
    expect(p.side).toBe("above")
    expect(p).toEqual({ top: 242, maxHeight: 420, side: "above" })
    expect(inViewport(p, 800)).toBe(true)
  })

  it("stays below when the content fits there, even with more room above", () => {
    const p = popoverPlacement({ anchorTop: 500, anchorBottom: 548, viewportHeight: 800, contentHeight: 200 })
    expect(p.side).toBe("below")
    expect(inViewport({ top: p.top, maxHeight: Math.min(p.maxHeight, 200) }, 800)).toBe(true)
  })

  it("takes all the room above, with internal scroll, when the content is taller", () => {
    const p = popoverPlacement({ anchorTop: 400, anchorBottom: 448, viewportHeight: 520, contentHeight: 600 })
    expect(p).toEqual({ top: 8, maxHeight: 386, side: "above" })
  })

  it("before the first measure, uses the larger side", () => {
    expect(popoverPlacement({ anchorTop: 100, anchorBottom: 148, viewportHeight: 800 }).side).toBe("below")
    expect(popoverPlacement({ anchorTop: 700, anchorBottom: 748, viewportHeight: 800 }).side).toBe("above")
  })

  it("clamps inside a very short viewport when neither side has the minimum height", () => {
    const p = popoverPlacement({ anchorTop: 120, anchorBottom: 168, viewportHeight: 300, contentHeight: 420 })
    expect(p.side).toBe("inside")
    expect(p).toEqual({ top: 8, maxHeight: 284, side: "inside" })
    expect(inViewport(p, 300)).toBe(true)
  })

  it("never returns a negative height", () => {
    const p = popoverPlacement({ anchorTop: 0, anchorBottom: 48, viewportHeight: 10, contentHeight: 420 })
    expect(p.maxHeight).toBeGreaterThanOrEqual(0)
    expect(p.top).toBeGreaterThanOrEqual(0)
  })
})
