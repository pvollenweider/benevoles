import { describe, it, expect, vi, beforeEach } from "vitest"

const send = vi.hoisted(() => vi.fn())
const bump = vi.hoisted(() => vi.fn())
const allowance = vi.hoisted(() => vi.fn())
vi.mock("../channels/email", () => ({ emailChannel: { send } }))
vi.mock("@/lib/usage-stats", () => ({ bumpPlatformCounter: bump }))
vi.mock("../send-limits", () => ({ takeSendAllowance: allowance }))
vi.mock("../org-send-guard", () => ({ organizationSendingVerdict: async () => null }))

import { sendNotification } from ".."
import type { NotificationPayload } from "../types"

const payload = { kind: "registration_confirmation", recipient: { email: "a@example.org" }, data: {} } as unknown as NotificationPayload

describe("sendNotification", () => {
  beforeEach(() => { vi.clearAllMocks(); allowance.mockResolvedValue({ ok: true }) })

  // #810: the statistics count what the limits held back or dropped.
  it("counts an email held or dropped by a limit, and sends nothing", async () => {
    allowance.mockResolvedValueOnce({ ok: false, limit: "org_per_minute", retryAfterMs: 1000 })
    expect(await sendNotification(payload)).toMatchObject({ held: true })
    allowance.mockResolvedValueOnce({ ok: false, limit: "recipient_per_hour", drop: true })
    expect(await sendNotification(payload)).toMatchObject({ blocked: true })
    expect(bump.mock.calls).toEqual([["emails_held"], ["emails_dropped"]])
    expect(send).not.toHaveBeenCalled()
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
})
