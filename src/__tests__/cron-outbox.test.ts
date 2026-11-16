import { describe, it, expect, vi, beforeEach } from "vitest"

// The 5-minute delivery run (#916): same secret as the other cron routes, records its run.
// It also runs the automatic validation first (#1371), so the « espace activé » emails leave in
// the same run; that step never stops the delivery.
const m = vi.hoisted(() => ({ deliver: vi.fn(), record: vi.fn(), summary: vi.fn(), dispatch: vi.fn(), after: vi.fn(), auto: vi.fn(), reported: [] as string[] }))
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: m.after }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverOutbox: m.deliver }))
// Scheduled messages (#1019) are turned into queued emails first, in the same run.
vi.mock("@/lib/scheduled-message-dispatch", () => ({ dispatchScheduledMessages: m.dispatch }))
vi.mock("@/lib/auto-approval-server", () => ({ runAutoApproval: m.auto }))
vi.mock("@/lib/report-error", () => ({ reportError: (key: string) => () => { m.reported.push(key) } }))
vi.mock("@/lib/job-runs", () => ({
  recordJobRun: async (job: string, fn: () => Promise<unknown>) => {
    m.record(job)
    const result = await fn()
    m.summary(result)
    return result
  },
}))

import { POST } from "@/app/api/cron/outbox/route"

const post = (auth?: string) => new Request("http://localhost/api/cron/outbox", { method: "POST", headers: auth ? { authorization: auth } : {} })
const counts = { candidates: 1, approved: 1, skipped: 0, failed: 0, cutOff: 0, expired: 0 }

describe("POST /api/cron/outbox", () => {
  beforeEach(() => {
    m.deliver.mockReset().mockResolvedValue({ sent: 2, retried: 0, failed: 0, cancelled: 1, held: 0 })
    m.dispatch.mockReset().mockResolvedValue({ sent: 1, skipped: 0, failed: 0 })
    m.auto.mockReset().mockResolvedValue(counts)
    m.record.mockReset()
    m.summary.mockReset()
    m.reported.length = 0
  })

  it("refuses without the secret", async () => {
    expect((await POST(post())).status).toBe(401)
    expect((await POST(post("Bearer nope"))).status).toBe(401)
    expect(m.deliver).not.toHaveBeenCalled()
    expect(m.dispatch).not.toHaveBeenCalled()
    expect(m.auto).not.toHaveBeenCalled()
  })

  it("validates new spaces first, then delivers the due emails and records the run", async () => {
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      scheduled: { sent: 1, skipped: 0, failed: 0 },
      outbox: { sent: 2, retried: 0, failed: 0, cancelled: 1, held: 0, autoApproval: counts },
    })
    expect(m.record).toHaveBeenCalledWith("outbox")
    // The step runs before delivery, so its queued emails leave in the same run.
    expect(m.auto.mock.invocationCallOrder[0]).toBeLessThan(m.deliver.mock.invocationCallOrder[0])
    // Its counts, only, are in the job's summary.
    expect(m.summary).toHaveBeenCalledWith(expect.objectContaining({ autoApproval: counts }))
  })

  // #1041: the push of a scheduled message runs after the response, never before the emails.
  it("hands the scheduled messages' push to after()", async () => {
    let deferred: (() => Promise<unknown>) | undefined
    m.dispatch.mockImplementation(async (_now: Date, opts: { deferPush: (job: () => Promise<unknown>) => void }) => {
      opts.deferPush(async () => "pushed")
      return { sent: 1, skipped: 0, failed: 0 }
    })
    m.after.mockImplementation((job: () => Promise<unknown>) => { deferred = job })
    expect((await POST(post("Bearer s3cret"))).status).toBe(200)
    expect(m.after).toHaveBeenCalledOnce()
    expect(m.deliver).toHaveBeenCalledOnce()
    expect(await deferred!()).toBe("pushed")
  })

  it("still delivers the outbox when the scheduled dispatch throws", async () => {
    m.dispatch.mockRejectedValue(new Error("db down"))
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect((await res.json()).scheduled).toBeNull()
    expect(m.deliver).toHaveBeenCalledOnce()
  })

  it("still delivers the outbox when the automatic validation throws, reporting it", async () => {
    m.auto.mockRejectedValue(new Error("db down"))
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect((await res.json()).outbox.autoApproval).toBeNull()
    expect(m.deliver).toHaveBeenCalledOnce()
    expect(m.reported).toContain("auto_approval.cron")
  })
})
