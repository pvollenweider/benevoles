import { describe, it, expect, vi, beforeEach } from "vitest"

// The 5-minute delivery run (#916): same secret as the other cron routes, records its run.
const m = vi.hoisted(() => ({ deliver: vi.fn(), record: vi.fn() }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/notifications/outbox", () => ({ deliverOutbox: m.deliver }))
vi.mock("@/lib/job-runs", () => ({ recordJobRun: (job: string, fn: () => Promise<unknown>) => { m.record(job); return fn() } }))

import { POST } from "@/app/api/cron/outbox/route"

const post = (auth?: string) => new Request("http://localhost/api/cron/outbox", { method: "POST", headers: auth ? { authorization: auth } : {} })

describe("POST /api/cron/outbox", () => {
  beforeEach(() => { m.deliver.mockReset().mockResolvedValue({ sent: 2, retried: 0, failed: 0, cancelled: 1, held: 0 }); m.record.mockReset() })

  it("refuses without the secret", async () => {
    expect((await POST(post())).status).toBe(401)
    expect((await POST(post("Bearer nope"))).status).toBe(401)
    expect(m.deliver).not.toHaveBeenCalled()
  })

  it("delivers the due emails and records the run", async () => {
    const res = await POST(post("Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outbox: { sent: 2, retried: 0, failed: 0, cancelled: 1, held: 0 } })
    expect(m.record).toHaveBeenCalledWith("outbox")
  })
})
