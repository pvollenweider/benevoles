import { describe, it, expect } from "vitest"
import { contactPhone } from "../contact-phone"

describe("contactPhone", () => {
  it("prefers the phone given for the registration", () => {
    expect(contactPhone({ phone: "079 111", volunteer: { phone: "079 999" } })).toBe("079 111")
  })

  it("falls back to the profile's phone", () => {
    expect(contactPhone({ phone: null, volunteer: { phone: "079 999" } })).toBe("079 999")
    expect(contactPhone({ volunteer: { phone: "079 999" } })).toBe("079 999")
  })

  it("treats blank values as missing", () => {
    expect(contactPhone({ phone: "  ", volunteer: { phone: "079 999" } })).toBe("079 999")
    expect(contactPhone({ phone: null, volunteer: { phone: " " } })).toBeNull()
  })
})
