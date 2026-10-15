import { describe, expect, it } from "vitest"
import { outcomeClass, statusBoxClass, STATUS_BOX_TONE } from "../status-message"

describe("status boxes", () => {
  it("colours the text with the box's own hue, never grey on a tint", () => {
    for (const tone of Object.values(STATUS_BOX_TONE)) {
      expect(tone).not.toMatch(/text-gray/)
      const [text, bg] = tone.split(" ")
      expect(text.split("-")[1]).toBe(bg.split("-")[1])
    }
    expect(statusBoxClass("success")).toContain("text-green-800 bg-green-50")
  })

  it("hides the outcome line until there is an outcome, then shows a success or an error box", () => {
    expect(outcomeClass(null)).toBe("sr-only")
    expect(outcomeClass({ kind: "success" })).toContain("text-green-800")
    expect(outcomeClass({ kind: "ok" })).toContain("text-green-800")
    expect(outcomeClass({ kind: "error" })).toContain("text-red-800")
  })
})
