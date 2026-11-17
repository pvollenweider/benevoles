import { describe, it, expect, vi, beforeEach } from "vitest"

const channelSend = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())
vi.mock("../channels/email", () => ({ emailChannel: { send: channelSend } }))
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findUnique } } }))

import { sendNotification } from "../index"
import { cancelPendingOutboxForOrganization, organizationBlocksSending, organizationSendingState, ORG_INACTIVE_REASON, sendingBlocked } from "../org-send-guard"

const payload = (organizationId?: string | null) => ({ kind: "registration_confirmation" as const, recipient: { email: "a@b.ch" }, organizationId, data: {} })

describe("sending for a deactivated organisation (#814)", () => {
  beforeEach(() => {
    channelSend.mockReset().mockResolvedValue({ ok: true })
    findUnique.mockReset()
  })

  it("blocks a deactivated or missing organisation, never a platform message", () => {
    expect(sendingBlocked("org", { active: true })).toBe(false)
    expect(sendingBlocked("org", { active: false })).toBe(true)
    expect(sendingBlocked("org", null)).toBe(true) // deleted: its outbox rows outlive it
    expect(sendingBlocked(null, null)).toBe(false)
    expect(sendingBlocked(undefined, null)).toBe(false)
  })

  it("reads the organisation at send time, and not at all for a platform message", async () => {
    findUnique.mockResolvedValueOnce({ active: false })
    expect(await organizationBlocksSending("org-1")).toBe(true)
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "org-1" }, select: { active: true, outboundEmailApprovedAt: true, autoApprovedAt: true, autoApprovalReviewedAt: true, createdAt: true, admins: { where: { isActive: true, role: { in: ["admin", "organizer", "super_admin"] } }, select: { email: true, createdAt: true } } } })
    findUnique.mockClear()
    expect(await organizationBlocksSending(null)).toBe(false)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("sendNotification never reaches SMTP for a deactivated organisation, and says it was blocked", async () => {
    findUnique.mockResolvedValueOnce({ active: false })
    expect(await sendNotification(payload("org-1"))).toEqual({ ok: false, reason: ORG_INACTIVE_REASON, permanent: true, blocked: true })
    expect(channelSend).not.toHaveBeenCalled()
  })

  it("sendNotification sends for an active organisation and for a platform message", async () => {
    findUnique.mockResolvedValueOnce({ active: true, outboundEmailApprovedAt: new Date("2026-01-01T00:00:00Z"), admins: [] })
    expect(await sendNotification(payload("org-1"))).toEqual({ ok: true })
    expect(await sendNotification(payload(null))).toEqual({ ok: true })
    expect(channelSend).toHaveBeenCalledTimes(2)
  })

  it("cancels only the organisation's pending emails at deactivation", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 })
    expect(await cancelPendingOutboxForOrganization({ notificationOutbox: { updateMany } }, "org-1")).toBe(3)
    expect(updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", status: "pending" },
      data: { status: "cancelled", lastError: ORG_INACTIVE_REASON, claimedAt: null, deliveryNotBefore: null },
    })
  })
})

describe("the review state of an automatically validated space, read with the send-time check", () => {
  const approved = new Date("2026-11-10T08:00:00Z")
  const row = (over: Record<string, unknown>) => ({ active: true, outboundEmailApprovedAt: approved, createdAt: approved, admins: [], ...over })
  beforeEach(() => { findUnique.mockReset() })

  it("is unreviewed while validated automatically and not yet reviewed, in the same single read", async () => {
    findUnique.mockResolvedValueOnce(row({ autoApprovedAt: approved, autoApprovalReviewedAt: null }))
    expect(await organizationSendingState("org-1", "a@b.ch")).toEqual({ refused: null, unreviewedAutoApproval: true })
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it("is back to normal once reviewed, and never concerns a space validated by hand", async () => {
    findUnique.mockResolvedValueOnce(row({ autoApprovedAt: approved, autoApprovalReviewedAt: new Date("2026-11-12T08:00:00Z") }))
    expect(await organizationSendingState("org-1", "a@b.ch")).toEqual({ refused: null, unreviewedAutoApproval: false })
    findUnique.mockResolvedValueOnce(row({ autoApprovedAt: null, autoApprovalReviewedAt: null }))
    expect(await organizationSendingState("org-1", "a@b.ch")).toEqual({ refused: null, unreviewedAutoApproval: false })
  })

  it("still refuses a deactivated space, and reads nothing for a platform email", async () => {
    findUnique.mockResolvedValueOnce(row({ active: false, autoApprovedAt: approved, autoApprovalReviewedAt: null }))
    expect(await organizationSendingState("org-1", "a@b.ch")).toMatchObject({ refused: ORG_INACTIVE_REASON })
    findUnique.mockClear()
    expect(await organizationSendingState(null, "a@b.ch")).toEqual({ refused: null, unreviewedAutoApproval: false })
    expect(findUnique).not.toHaveBeenCalled()
  })

})
