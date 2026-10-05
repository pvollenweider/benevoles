/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import { markAutoplayIntent, consumeAutoplayIntent, shouldAutoplay } from "../video-autoplay"

afterEach(() => sessionStorage.clear())

describe("shouldAutoplay (pure)", () => {
  it("only when arriving from the gallery and motion is allowed", () => {
    expect(shouldAutoplay({ fromGallery: true, reducedMotion: false })).toBe(true)
  })

  it("never on a direct visit, even without reduced motion", () => {
    expect(shouldAutoplay({ fromGallery: false, reducedMotion: false })).toBe(false)
  })

  it("never under prefers-reduced-motion: reduce, even from the gallery", () => {
    expect(shouldAutoplay({ fromGallery: true, reducedMotion: true })).toBe(false)
  })

  it("never when both conditions are against it", () => {
    expect(shouldAutoplay({ fromGallery: false, reducedMotion: true })).toBe(false)
  })
})

describe("markAutoplayIntent / consumeAutoplayIntent", () => {
  it("is false until marked", () => {
    expect(consumeAutoplayIntent()).toBe(false)
  })

  it("is true exactly once after marking, then clears itself (read-once)", () => {
    markAutoplayIntent()
    expect(consumeAutoplayIntent()).toBe(true)
    expect(consumeAutoplayIntent()).toBe(false)
  })

  it("never throws when storage is unavailable", () => {
    const original = window.sessionStorage
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new Error("blocked") },
    })
    try {
      expect(() => markAutoplayIntent()).not.toThrow()
      expect(consumeAutoplayIntent()).toBe(false)
    } finally {
      Object.defineProperty(window, "sessionStorage", { configurable: true, value: original })
    }
  })
})
