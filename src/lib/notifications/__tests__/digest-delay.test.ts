import { describe, it, expect } from "vitest"
import { digestDelayMs } from "../digest-items"

// #869: the grouping delay, overridable for the E2E job (0: the email leaves at once).
describe("digestDelayMs", () => {
  it("keeps the default without an override", () => {
    expect(digestDelayMs(300_000, {})).toBe(300_000)
  })
  it("uses DIGEST_DELAY_SECONDS, 0 included", () => {
    expect(digestDelayMs(300_000, { DIGEST_DELAY_SECONDS: "0" })).toBe(0)
    expect(digestDelayMs(300_000, { DIGEST_DELAY_SECONDS: "60" })).toBe(60_000)
  })
  it("ignores an invalid value", () => {
    expect(digestDelayMs(300_000, { DIGEST_DELAY_SECONDS: "-5" })).toBe(300_000)
    expect(digestDelayMs(300_000, { DIGEST_DELAY_SECONDS: "abc" })).toBe(300_000)
  })
})
