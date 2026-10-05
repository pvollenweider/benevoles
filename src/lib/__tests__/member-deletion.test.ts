// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { memberDeletionEligibility, MEMBER_DELETION_REASON } from "../member-deletion"

describe("memberDeletionEligibility (#667)", () => {
  it("is eligible for an inactive record with no registration at all", () => {
    expect(memberDeletionEligibility({ active: false, mergedIntoId: null }, 0)).toEqual({ eligible: true })
  })

  it("refuses an active record, whatever its registration count", () => {
    expect(memberDeletionEligibility({ active: true, mergedIntoId: null }, 0)).toEqual({ eligible: false, reason: MEMBER_DELETION_REASON.active })
    expect(memberDeletionEligibility({ active: true, mergedIntoId: null }, 3)).toEqual({ eligible: false, reason: MEMBER_DELETION_REASON.active })
  })

  it("refuses an inactive record with any registration, whatever its status", () => {
    expect(memberDeletionEligibility({ active: false, mergedIntoId: null }, 1)).toEqual({ eligible: false, reason: MEMBER_DELETION_REASON.hasRegistrations })
    expect(memberDeletionEligibility({ active: false, mergedIntoId: null }, 5)).toEqual({ eligible: false, reason: MEMBER_DELETION_REASON.hasRegistrations })
  })

  it("refuses a merged tombstone even with no registration (purged by retention instead, #600)", () => {
    expect(memberDeletionEligibility({ active: false, mergedIntoId: "vol-keep" }, 0)).toEqual({ eligible: false, reason: MEMBER_DELETION_REASON.tombstone })
  })

  it("the tombstone reason wins even if the tombstone were somehow still active", () => {
    expect(memberDeletionEligibility({ active: true, mergedIntoId: "vol-keep" }, 0)).toEqual({ eligible: false, reason: MEMBER_DELETION_REASON.tombstone })
  })
})
