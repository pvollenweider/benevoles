import { describe, it, expect, vi, beforeEach } from "vitest"

const send = vi.hoisted(() => vi.fn())
const bump = vi.hoisted(() => vi.fn())
const allowance = vi.hoisted(() => vi.fn())
const record = vi.hoisted(() => vi.fn())
vi.mock("../limit-hits", () => ({ recordLimitHit: record }))
vi.mock("../channels/email", () => ({ emailChannel: { send } }))
vi.mock("@/lib/usage-stats", () => ({ bumpPlatformCounter: bump }))
vi.mock("../send-limits", () => ({ takeSendAllowance: allowance }))
const state = vi.hoisted(() => vi.fn())
vi.mock("../org-send-guard", () => ({ organizationSendingState: state }))

import { sendNotification } from ".."
import type { NotificationPayload } from "../types"

const payload = { kind: "registration_confirmation", recipient: { email: "a@example.org" }, data: {} } as unknown as NotificationPayload

describe("sendNotification", () => {
  beforeEach(() => { vi.clearAllMocks(); allowance.mockResolvedValue({ ok: true }); state.mockResolvedValue({ refused: null, unreviewedAutoApproval: false }) })

  // #810: the statistics count what the limits held back or dropped.
  it("counts an email held or dropped by a limit, and sends nothing", async () => {
    allowance.mockResolvedValueOnce({ ok: false, limit: "org_per_minute", retryAfterMs: 1000 })
    expect(await sendNotification(payload)).toMatchObject({ held: true })
    allowance.mockResolvedValueOnce({ ok: false, limit: "recipient_per_hour", drop: true })
    expect(await sendNotification(payload)).toMatchObject({ blocked: true })
    expect(bump.mock.calls).toEqual([["emails_held"], ["emails_dropped"]])
    expect(send).not.toHaveBeenCalled()
  })

  // #1100: a refused email (dropped, or a direct send over a limit) is recorded here; a held
  // outbox email is recorded by the outbox, once per email and hour.
  it("records a dropped or direct-held email as refused, not an outbox-held one", async () => {
    allowance.mockResolvedValueOnce({ ok: false, limit: "recipient_per_hour", drop: true })
    expect(await sendNotification({ ...payload, organizationId: "org1" })).toMatchObject({ blocked: true, limit: "recipient_per_hour" })
    allowance.mockResolvedValueOnce({ ok: false, limit: "org_per_minute", retryAfterMs: 1000 })
    expect(await sendNotification({ ...payload, organizationId: "org1" })).toMatchObject({ held: true, limit: "org_per_minute" })
    allowance.mockResolvedValueOnce({ ok: false, limit: "org_per_minute", retryAfterMs: 1000 })
    expect(await sendNotification({ ...payload, organizationId: "org1", outboxId: "row1" })).toMatchObject({ held: true })
    expect(record.mock.calls).toEqual([
      [{ organizationId: "org1", limit: "recipient_per_hour", kind: "registration_confirmation", outcome: "refused" }],
      [{ organizationId: "org1", limit: "org_per_minute", kind: "registration_confirmation", outcome: "refused" }],
    ])
  })

  it("delivers through the email channel and returns its outcome", async () => {
    send.mockResolvedValueOnce({ ok: true })
    expect(await sendNotification(payload)).toEqual({ ok: true })
    expect(send).toHaveBeenCalledWith(payload)
  })
  it("passes a failure through unchanged", async () => {
    send.mockResolvedValueOnce({ ok: false, reason: "SMTP_HOST manquant : email non envoyé." })
    expect(await sendNotification(payload)).toEqual({ ok: false, reason: "SMTP_HOST manquant : email non envoyé." })
  })

  // A space validated automatically and not yet reviewed: its bulk emails get the reduced daily
  // cap, from the organisation row the send-time check already reads; reviewed, the normal one.
  it("passes the review state read by the organisation check to the limits", async () => {
    send.mockResolvedValue({ ok: true })
    const bulk = { ...payload, kind: "targeted_message", organizationId: "org1" } as NotificationPayload
    state.mockResolvedValueOnce({ refused: null, unreviewedAutoApproval: true })
    await sendNotification(bulk)
    state.mockResolvedValueOnce({ refused: null, unreviewedAutoApproval: false })
    await sendNotification(bulk)
    expect(state).toHaveBeenCalledTimes(2)
    expect(allowance.mock.calls).toEqual([
      ["org1", "targeted_message", { recipientEmail: "a@example.org", unreviewedAutoApproval: true }],
      ["org1", "targeted_message", { recipientEmail: "a@example.org", unreviewedAutoApproval: false }],
    ])
  })

  it("refuses before the limits when the organisation check refuses", async () => {
    state.mockResolvedValueOnce({ refused: "Organisation désactivée.", unreviewedAutoApproval: true })
    expect(await sendNotification({ ...payload, organizationId: "org1" })).toEqual({ ok: false, reason: "Organisation désactivée.", permanent: true, blocked: true })
    expect(allowance).not.toHaveBeenCalled()
  })
})
