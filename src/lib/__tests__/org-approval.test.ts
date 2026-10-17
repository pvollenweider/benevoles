import { describe, it, expect } from "vitest"
import { ADMIN_INVITE_PENDING_ERROR, canEmailThirdParties, canInviteAdmins, canPublish, pendingRecipientAllowed, PUBLIC_ORG_WHERE, signupOwnerEmails } from "../org-approval"
import { sendingVerdict, ORG_INACTIVE_REASON, ORG_PENDING_REASON } from "../notifications/org-send-guard"
import { inviteTestFailure, INVITE_TEST_LIMIT, INVITE_TEST_WINDOW_MS } from "../invite-test-email"

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
    const pending = { active: true, outboundEmailApprovedAt: null, createdAt: approved, admins: [{ email: "owner@example.org", createdAt: approved }] }
    expect(sendingVerdict("org-1", pending, "owner@example.org")).toBeNull()
    expect(sendingVerdict("org-1", pending, "volunteer@example.org")).toBe(ORG_PENDING_REASON)
    expect(sendingVerdict("org-1", pending, undefined)).toBe(ORG_PENDING_REASON) // a push
    // Approved: anyone. Deactivated: no one, deactivation first.
    expect(sendingVerdict("org-1", { ...pending, outboundEmailApprovedAt: approved }, "volunteer@example.org")).toBeNull()
    expect(sendingVerdict("org-1", { ...pending, active: false }, "owner@example.org")).toBe(ORG_INACTIVE_REASON)
    expect(sendingVerdict(null, null, "anyone@example.org")).toBeNull()
  })
})

describe("addresses a pending organisation may trust (#1045)", () => {
  const later = (ms: number) => new Date(approved.getTime() + ms)

  it("trusts only the owner account created with the space by the sign-up confirmation", () => {
    const admins = [
      { email: "owner@example.org", createdAt: later(40) },
      { email: "invited@example.org", createdAt: later(5 * 60_000) }, // activated from an invitation
    ]
    expect(signupOwnerEmails(approved, admins)).toEqual(["owner@example.org"])
    expect(signupOwnerEmails(approved.toISOString(), [{ email: "a@x.ch", createdAt: later(10_001).toISOString() }])).toEqual([])
  })

  it("refuses an email of a pending space to an active account added after its creation", () => {
    const pending = { active: true, outboundEmailApprovedAt: null, createdAt: approved, admins: [{ email: "owner@example.org", createdAt: approved }, { email: "invited@example.org", createdAt: later(3_600_000) }] }
    expect(sendingVerdict("org-1", pending, "owner@example.org")).toBeNull()
    expect(sendingVerdict("org-1", pending, "invited@example.org")).toBe(ORG_PENDING_REASON)
    // Approved: the invited account is reached like anyone else.
    expect(sendingVerdict("org-1", { ...pending, outboundEmailApprovedAt: approved }, "invited@example.org")).toBeNull()
  })

  it("defers inviting more administrators until the outbound email approval", () => {
    expect(canInviteAdmins({ outboundEmailApprovedAt: null })).toBe(false)
    expect(canInviteAdmins({ outboundEmailApprovedAt: approved })).toBe(true)
    expect(ADMIN_INVITE_PENDING_ERROR).toMatch(/^Votre espace est en attente de validation\./)
  })
})

describe("refused invitation test email (#1045)", () => {
  it("keeps a small quota per organisation", () => {
    expect(INVITE_TEST_LIMIT).toBe(5)
    expect(INVITE_TEST_WINDOW_MS).toBe(60 * 60 * 1000)
  })

  it("explains the organisation refusals and the sending limit, never the SMTP reason", () => {
    expect(inviteTestFailure({ reason: ORG_PENDING_REASON })).toMatchObject({ status: 403, error: expect.stringMatching(/en attente de validation/) })
    expect(inviteTestFailure({ reason: ORG_INACTIVE_REASON })).toMatchObject({ status: 403, error: expect.stringMatching(/désactivé/) })
    expect(inviteTestFailure({ reason: "limit:org_hour", held: true })).toMatchObject({ status: 429 })
    const smtp = inviteTestFailure({ reason: "550 5.1.1 mailbox unavailable" })
    expect(smtp).toEqual({ status: 502, error: "Échec de l'envoi de l'email." })
  })
})
