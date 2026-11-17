// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest"
import { SIGNUP_ATTEMPTS, uniqueViolationStep } from "../signup-retry"
import { noticeConfirmationSummary, pendingConfirmationSummary } from "../signup-confirmation"

describe("uniqueViolationStep", () => {
  it("without a member holding the address, refuses", () => {
    expect(uniqueViolationStep({ ownerFound: false, ownsEmail: false, attempt: 1 })).toBe("refuse")
    expect(uniqueViolationStep({ ownerFound: false, ownsEmail: true, attempt: 1 })).toBe("refuse")
  })

  it("with proof of the address, answers already registered at once", () => {
    expect(uniqueViolationStep({ ownerFound: true, ownsEmail: true, attempt: 1 })).toBe("already_registered")
  })

  it("without proof, tries again while attempts remain, then tells the owner", () => {
    for (let attempt = 1; attempt < SIGNUP_ATTEMPTS; attempt++) {
      expect(uniqueViolationStep({ ownerFound: true, ownsEmail: false, attempt })).toBe("retry")
    }
    expect(uniqueViolationStep({ ownerFound: true, ownsEmail: false, attempt: SIGNUP_ATTEMPTS })).toBe("notice")
  })
})

describe("noticeConfirmationSummary", () => {
  const now = new Date("2031-05-01T10:00:00Z")
  const first = new Date("2031-06-01T08:00:00Z")
  const later = new Date("2031-06-01T14:00:00Z")

  it("uses where the last attempt placed the shifts", () => {
    const placed = [{ status: "active", startsAt: first }, { status: "waiting", startsAt: later }]
    expect(noticeConfirmationSummary(placed, [first, later], now)).toEqual(pendingConfirmationSummary(placed, now))
    expect(noticeConfirmationSummary(placed, [first, later], now)).toMatchObject({ held: 1, waiting: 1 })
  })

  it("without placements, counts every selected shift as held, with the same deadline", () => {
    const summary = noticeConfirmationSummary(null, [later, first], now)
    expect(summary).toEqual({ expiresAt: new Date("2031-05-02T10:00:00Z"), held: 2, waiting: 0 })
  })
})
