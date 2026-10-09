import { describe, it, expect } from "vitest"
import { abandonedSignupSpaceWhere, decideReview, pendingSummary, PENDING_ORG_WHERE } from "../org-review"
import { orgStatus, ORG_STATUS_LABELS } from "../org-suspension"
import { approveOrgRecap, refuseOrgRecap } from "../action-recap"

const now = new Date("2026-10-09T12:00:00Z")
const pending = { active: true, suspendedAt: null, publicationApprovedAt: null, outboundEmailApprovedAt: null }
const approved = { ...pending, publicationApprovedAt: now, outboundEmailApprovedAt: now }

describe("review of a space awaiting validation (#810, part 4c)", () => {
  it("tells a pending space apart, suspension and deactivation first", () => {
    expect(orgStatus(pending)).toBe("pending")
    expect(orgStatus({ ...pending, outboundEmailApprovedAt: now })).toBe("pending") // one grant missing is enough
    expect(orgStatus(approved)).toBe("active")
    expect(orgStatus({ active: true, suspendedAt: null })).toBe("active") // grants not read: granted
    expect(orgStatus({ ...pending, active: false })).toBe("inactive")
    expect(orgStatus({ ...pending, active: false, suspendedAt: now })).toBe("suspended")
    expect(ORG_STATUS_LABELS.pending).toBe("En attente de validation")
  })

  it("approves with both grants, or refuses; only a pending space, only a known decision", () => {
    expect(decideReview(pending, "approve", now)).toEqual({ ok: true, decision: "approve", update: { publicationApprovedAt: now, outboundEmailApprovedAt: now } })
    expect(decideReview(pending, "refuse", now)).toEqual({ ok: true, decision: "refuse" })
    expect(decideReview(approved, "approve", now)).toMatchObject({ ok: false, status: 409 })
    expect(decideReview({ ...pending, active: false, suspendedAt: now }, "refuse", now)).toMatchObject({ ok: false, status: 409 })
    expect(decideReview(pending, "delete", now)).toMatchObject({ ok: false, status: 400 })
  })

  it("selects the pending spaces: active, not suspended, a grant missing", () => {
    expect(PENDING_ORG_WHERE).toEqual({ active: true, suspendedAt: null, OR: [{ publicationApprovedAt: null }, { outboundEmailApprovedAt: null }] })
  })

  it("sums up the waiting spaces in one daily sentence", () => {
    expect(pendingSummary([], now)).toBeNull()
    expect(pendingSummary([new Date("2026-10-09T10:00:00Z")], now)).toBe("1 espace attend une validation.")
    expect(pendingSummary([new Date("2026-10-09T10:00:00Z"), new Date("2026-10-07T10:00:00Z"), new Date("2026-10-08T09:00:00Z")], now)).toBe("3 espaces attendent une validation, dont 2 depuis plus de 24 heures.")
  })

  it("says what each decision does", () => {
    expect(approveOrgRecap("Fête").lines[2]).toBe("Ses administrateurs reçoivent un email « Votre espace est activé ».")
    expect(refuseOrgRecap("Fête").lines).toContain("Aucun email n'est envoyé.")
  })
})

describe("abandonedSignupSpaceWhere (#810)", () => {
  it("matches only a sign-up space past the cutoff, with no active administrator", () => {
    const cutoff = new Date("2026-09-09T00:00:00Z")
    expect(abandonedSignupSpaceWhere(cutoff)).toEqual({
      active: true,
      suspendedAt: null,
      publicationApprovedAt: null,
      outboundEmailApprovedAt: null,
      createdAt: { lt: cutoff },
      admins: { none: { isActive: true } },
    })
  })
})
