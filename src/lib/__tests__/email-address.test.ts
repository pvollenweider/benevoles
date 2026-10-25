import { describe, it, expect } from "vitest"
import { z } from "zod"
import { isValidEmailAddress, mailtoHref, normalizeEmail } from "../email-address"

describe("email normalization (#310)", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com")
  })

  it("the zod pattern used by the routes normalizes before validating", () => {
    const schema = z.string().trim().toLowerCase().email()
    expect(schema.parse("  Alice@Example.COM ")).toBe("alice@example.com")
    expect(schema.safeParse(" not-an-email ").success).toBe(false)
  })
})

describe("isValidEmailAddress", () => {
  it("accepts one address, spaces around it and any case", () => {
    expect(isValidEmailAddress("alice@example.com")).toBe(true)
    expect(isValidEmailAddress("  Alice@Example.COM\r\n")).toBe(true)
  })

  it.each(["alice@example.com, eve@example.net", "alice@example.com\r\neve@example.net", "alice martin@example.com", "alice@example.com?bcc=eve@example.net", "", "a".repeat(190) + "@example.com"])(
    "refuses %j",
    (value) => {
      expect(isValidEmailAddress(value)).toBe(false)
    },
  )
})

describe("mailtoHref", () => {
  it("links one valid address", () => {
    expect(mailtoHref("Alice@Example.com")).toBe("mailto:alice@example.com")
    expect(mailtoHref("o'brien+tag@example.com")).toBe("mailto:o'brien%2Btag@example.com")
  })

  it("gives no link for a list, extra headers, nothing or a missing address", () => {
    expect(mailtoHref("alice@example.com, eve@example.net")).toBeNull()
    expect(mailtoHref("alice@example.com?bcc=eve@example.net&body=x")).toBeNull()
    expect(mailtoHref("")).toBeNull()
    expect(mailtoHref(null)).toBeNull()
    expect(mailtoHref(undefined)).toBeNull()
  })
})
