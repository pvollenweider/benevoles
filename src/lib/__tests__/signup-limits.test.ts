// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { SIGNUP_COMMENT_MAX, SIGNUP_PHONE_MAX, tooLongSignupField } from "../signup-limits"

// Bounded free text of the public sign-up (#1047).
describe("tooLongSignupField", () => {
  it("accepts values up to the limits, and missing or non-text ones", () => {
    expect(tooLongSignupField({ phone: "1".repeat(SIGNUP_PHONE_MAX), comment: "x".repeat(SIGNUP_COMMENT_MAX) })).toBeNull()
    expect(tooLongSignupField({})).toBeNull()
    expect(tooLongSignupField({ phone: 12, comment: null })).toBeNull()
  })

  it("names the field one character over its limit, phone first", () => {
    expect(tooLongSignupField({ phone: "1".repeat(SIGNUP_PHONE_MAX + 1) })).toMatchObject({ field: "phone" })
    expect(tooLongSignupField({ comment: "x".repeat(SIGNUP_COMMENT_MAX + 1) })?.message).toContain("commentaire")
    expect(tooLongSignupField({ phone: "1".repeat(99), comment: "x".repeat(9999) })?.field).toBe("phone")
  })
})
