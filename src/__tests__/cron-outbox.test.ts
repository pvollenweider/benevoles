import { describe, it, expect, vi, beforeEach } from "vitest"

// The 5-minute delivery run (#916): same secret as the other cron routes, records its run.
const m = vi.hoisted(() => ({ deliver: vi.fn(), record: vi.fn(), dispatch: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverOutbox: m.deliver }))
// Scheduled messages (#1019) are turned into queued emails first, in the same run.
vi.mock("@/lib/scheduled-message-dispatch", () => ({ dispatchScheduledMessages: m.dispatch }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: (job: string, fn: () => Promise<unknown>) => { m.record(job); return fn() } }))

import { POST } from "@/app/api/cron/outbox/route"

const post = (auth?: string) => new Request("http://localhost/api/cron/outbox", { method: "POST", headers: auth ? { authorization: auth } : {} })

describe("POST /api/cron/outbox", () => {
  beforeEach(() => {
    m.deliver.mockReset().mockResolvedValue({ sent: 2, retried: 0, failed: 0, cancelled: 1, held: 0 })
    m.dispatch.mockReset().mockResolvedValue({ sent: 1, skipped: 0, failed: 0 })
    m.record.mockReset()
  })

  it("refuses without the secret", async () => {
    expect((await POST(post())).status).toBe(401)
    expect((await POST(post("Bearer nope"))).status).toBe(401)
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.dispatch).not.toHaveBeenCalled()
  })

  it("delivers the due emails and records the run", async () => {
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ scheduled: { sent: 1, skipped: 0, failed: 0 }, outbox: { sent: 2, retried: 0, failed: 0, cancelled: 1, held: 0 } })
    expect(m.record).toHaveBeenCalledWith("outbox")
    // Dispatched before the delivery, so a due scheduled message leaves in the same run.
    expect(m.dispatch.mock.invocationCallOrder[0]).toBeLessThan(m.deliver.mock.invocationCallOrder[0])
  })

  it("still delivers the outbox when the scheduled dispatch throws", async () => {
    m.dispatch.mockRejectedValue(new Error("db down"))
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect((await res.json()).scheduled).toBeNull()
    expect(m.deliver).toHaveBeenCalledOnce()
  })
})
