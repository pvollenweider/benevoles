// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"

// Deferred bounces (#602): same secret as the other cron routes, no-op without IMAP settings.
const mocks = vi.hoisted(() => ({ process: vi.fn(), alerts: vi.fn(), deliver: vi.fn(), report: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/bounce-mailbox", () => ({ processDeferredBounces: mocks.process }))
vi.mock("@/lib/address-alert-data", () => ({ enqueueAddressAlerts: mocks.alerts }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverAfterResponse: mocks.deliver }))
vi.mock("@/lib/report-error", () => ({ reportError: () => mocks.report }))

import { POST } from "@/app/api/cron/bounces/route"

const post = (auth?: string) => new Request("http://localhost/api/cron/bounces", { method: "POST", headers: auth ? { authorization: auth } : {} })

describe("POST /api/cron/bounces", () => {
  beforeEach(() => {
    mocks.alerts.mockReset().mockResolvedValue([])
    mocks.deliver.mockReset()
    mocks.report.mockReset()
    mocks.process.mockReset().mockResolvedValue({
      configured: true,
      scanned: 3,
      flagged: 1,
      alreadyKnown: 1,
      ignoredTemporary: 0,
      ignored: 1,
      uncorrelated: 1,
      errors: 0,
    })
  })

  it("refuses without the secret", async () => {
    expect((await POST(post())).status).toBe(401)
    expect((await POST(post("Bearer nope"))).status).toBe(401)
    expect(mocks.process).not.toHaveBeenCalled()
  })

  it("runs the reader and returns its counts with the secret", async () => {
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      configured: true,
      scanned: 3,
      flagged: 1,
      alreadyKnown: 1,
      ignoredTemporary: 0,
      ignored: 1,
      uncorrelated: 1,
      errors: 0,
      addressAlerts: 0,
    })
    expect(mocks.process).toHaveBeenCalledOnce()
  })

  // #1476: the organisers are told at once when someone whose address just failed is expected soon.
  it("queues the address alerts after the reader and sends them after the response", async () => {
    mocks.alerts.mockResolvedValue(["o1", "o2"])
    const res = await POST(post("Bearer s3cret"))
    expect((await res.json()).addressAlerts).toBe(2)
    expect(mocks.deliver).toHaveBeenCalledWith(["o1", "o2"])
    expect(mocks.process.mock.invocationCallOrder[0]).toBeLessThan(mocks.alerts.mock.invocationCallOrder[0])
  })

  it("still returns the reader's counts when the alerts fail", async () => {
    mocks.alerts.mockRejectedValue(new Error("db down"))
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ flagged: 1, addressAlerts: 0 })
    expect(mocks.report).toHaveBeenCalledOnce()
  })

  it("is a no-op when the mailbox is not configured", async () => {
    mocks.process.mockResolvedValue({ configured: false, skipped: "not_configured", scanned: 0, flagged: 0, alreadyKnown: 0, ignoredTemporary: 0, ignored: 0, uncorrelated: 0, errors: 0 })
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ configured: false, skipped: "not_configured", scanned: 0 })
  })
})
