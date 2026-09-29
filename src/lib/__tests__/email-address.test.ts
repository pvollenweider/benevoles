import { describe, it, expect } from "vitest"
import { z } from "zod"
import { normalizeEmail } from "../email-address"

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
