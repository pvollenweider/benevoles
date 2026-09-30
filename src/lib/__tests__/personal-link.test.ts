import { describe, it, expect } from "vitest"
import { INVALID_LINK_STEPS, lastLinkEmailLabel, LINK_REQUEST_LIMIT, LINK_REQUEST_RESPONSE, PERSONAL_LINK_NOTICE } from "../personal-link"

// The personal link explained (#376).
describe("personal link copy", () => {
  it("dates the last email in the organization's time zone, nothing when unknown", () => {
    expect(lastLinkEmailLabel("2026-07-04T08:30:00Z", "Europe/Zurich")).toBe("Dernier email contenant ce lien : samedi 4 juillet à 10:30.")
    expect(lastLinkEmailLabel(null, "Europe/Zurich")).toBeNull()
    expect(lastLinkEmailLabel("nope", "Europe/Zurich")).toBeNull()
  })

  it("never confirms whether an address is registered, and says the link is private", () => {
    expect(LINK_REQUEST_RESPONSE).toMatch(/^Si une inscription existe/)
    expect(PERSONAL_LINK_NOTICE).toContain("Ne le partage pas")
    expect(INVALID_LINK_STEPS).toHaveLength(3)
    expect(LINK_REQUEST_LIMIT).toBe(3)
  })
})
