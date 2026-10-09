import { describe, it, expect } from "vitest"
import { canEmailThirdParties, canPublish, pendingRecipientAllowed, PUBLIC_ORG_WHERE } from "../org-approval"
import { sendingVerdict, ORG_INACTIVE_REASON, ORG_PENDING_REASON } from "../notifications/org-send-guard"

const approved = new Date("2026-01-01T00:00:00Z")

describe("permissions of an organisation awaiting validation (#810)", () => {
  it("keeps publishing and emailing third parties as two separate grants", () => {
    expect(canPublish({ publicationApprovedAt: null })).toBe(false)
    expect(canPublish({ publicationApprovedAt: approved })).toBe(true)
    expect(canEmailThirdParties({ outboundEmailApprovedAt: null })).toBe(false)
    expect(canEmailThirdParties({ outboundEmailApprovedAt: "2026-01-01T00:00:00.000Z" })).toBe(true)
  })

  it("opens public pages only to an active organisation allowed to publish", () => {
    expect(PUBLIC_ORG_WHERE).toEqual({ active: true, publicationApprovedAt: { not: null } })
  })

  it("lets a pending organisation email only its own administrators, whatever the case", () => {
    expect(pendingRecipientAllowed("Owner@Example.org ", ["owner@example.org"])).toBe(true)
    expect(pendingRecipientAllowed("someone@example.org", ["owner@example.org"])).toBe(false)
    expect(pendingRecipientAllowed(null, ["owner@example.org"])).toBe(false)
  })

  it("refuses an email of a pending organisation to anyone else, and every push", () => {
    const pending = { active: true, outboundEmailApprovedAt: null, admins: [{ email: "owner@example.org" }] }
    expect(sendingVerdict("org-1", pending, "owner@example.org")).toBeNull()
    expect(sendingVerdict("org-1", pending, "volunteer@example.org")).toBe(ORG_PENDING_REASON)
    expect(sendingVerdict("org-1", pending, undefined)).toBe(ORG_PENDING_REASON) // a push
    // Approved: anyone. Deactivated: no one, deactivation first.
    expect(sendingVerdict("org-1", { ...pending, outboundEmailApprovedAt: approved }, "volunteer@example.org")).toBeNull()
    expect(sendingVerdict("org-1", { ...pending, active: false }, "owner@example.org")).toBe(ORG_INACTIVE_REASON)
    expect(sendingVerdict(null, null, "anyone@example.org")).toBeNull()
  })
})
