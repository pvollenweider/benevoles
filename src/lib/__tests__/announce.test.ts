import { describe, it, expect, vi } from "vitest"
import { announce } from "../announce"

describe("announce", () => {
  it("empties the region, then fills it on the next frame, so a repeated text is voiced again", () => {
    const raf = vi.fn((cb: FrameRequestCallback) => { cb(0); return 1 })
    vi.stubGlobal("requestAnimationFrame", raf)
    const set = vi.fn()
    announce(set, "Créneau supprimé.")
    announce(set, "Créneau supprimé.")
    expect(set.mock.calls.map((c) => c[0])).toEqual(["", "Créneau supprimé.", "", "Créneau supprimé."])
    vi.unstubAllGlobals()
  })

  it("sets the text directly without requestAnimationFrame", () => {
    vi.stubGlobal("requestAnimationFrame", undefined)
    const set = vi.fn()
    announce(set, "x")
    expect(set).toHaveBeenLastCalledWith("x")
    vi.unstubAllGlobals()
  })
})
