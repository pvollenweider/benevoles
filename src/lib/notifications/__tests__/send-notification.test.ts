import { describe, it, expect, vi } from "vitest"

const send = vi.hoisted(() => vi.fn())
vi.mock("../channels/email", () => ({ emailChannel: { send } }))

import { sendNotification } from ".."
import type { NotificationPayload } from "../types"

const payload = { kind: "registration_confirmation", recipient: { email: "a@example.org" }, data: {} } as unknown as NotificationPayload

describe("sendNotification", () => {
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
