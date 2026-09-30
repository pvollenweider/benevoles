import { describe, it, expect } from "vitest"
import { ACCENT_KEYS, eventAccent, isAccentKey } from "../event-accent"
import { COLOR_OPTIONS } from "../roles"

// Accent colour of an event's public page (#300, part 1).
describe("eventAccent", () => {
  it("covers every colour of the shared palette, and nothing else", () => {
    expect(ACCENT_KEYS).toEqual(COLOR_OPTIONS.map((o) => o.key))
    for (const key of ACCENT_KEYS) expect(eventAccent(key)).not.toBeNull()
    expect(isAccentKey("#ff0000")).toBe(false)
    expect(isAccentKey("toString")).toBe(false)
    expect(eventAccent(null)).toBeNull()
    expect(eventAccent("")).toBeNull()
  })

  it("pairs a dark band with white text and a light tint for secondary text", () => {
    const a = eventAccent("blue")!
    expect(a.band).toBe("bg-blue-700 text-white")
    expect(a.soft).toBe("text-blue-100")
    expect(a.label).toBe("Bleu")
    expect(a.swatch).toBe("bg-blue-600")
    for (const key of ACCENT_KEYS) {
      const { band, soft } = eventAccent(key)!
      expect(band).toMatch(/^bg-[a-z]+-(700|800) text-white$/)
      expect(soft).toMatch(/^text-[a-z]+-(100|200)$/)
    }
  })
})
