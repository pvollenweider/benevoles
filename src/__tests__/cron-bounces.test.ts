// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeEach, describe, expect, it, vi } from "vitest"

// Deferred bounces (#602): same secret as the other cron routes, no-op without IMAP settings.
const mocks = vi.hoisted(() => ({ process: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/bounce-mailbox", () => ({ processDeferredBounces: mocks.process }))

import { POST } from "@/app/api/cron/bounces/route"

const post = (auth?: string) => new Request("http://localhost/api/cron/bounces", { method: "POST", headers: auth ? { authorization: auth } : {} })

describe("POST /api/cron/bounces", () => {
  beforeEach(() => {
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
    })
    expect(mocks.process).toHaveBeenCalledOnce()
  })

  it("is a no-op when the mailbox is not configured", async () => {
    mocks.process.mockResolvedValue({ configured: false, skipped: "not_configured", scanned: 0, flagged: 0, alreadyKnown: 0, ignoredTemporary: 0, ignored: 0, uncorrelated: 0, errors: 0 })
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ configured: false, skipped: "not_configured", scanned: 0 })
  })
})
