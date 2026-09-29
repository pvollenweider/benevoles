import { describe, it, expect, vi, beforeEach } from "vitest"

const heartbeat = vi.hoisted(() => vi.fn())
vi.mock("@/lib/job-runs", async (orig) => ({ ...(await orig<typeof import("@/lib/job-runs")>()), heartbeat }))
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s3cret" } }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { POST } from "@/app/api/cron/heartbeat/route"

const post = (body: unknown, auth?: string) =>
  new Request("http://localhost/api/cron/heartbeat", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) })

// External jobs report through the same secret as the other cron routes (#383).
describe("POST /api/cron/heartbeat", () => {
  beforeEach(() => heartbeat.mockReset())

  it("refuses without the secret", async () => {
    expect((await POST(post({ job: "backup" }))).status).toBe(401)
    expect((await POST(post({ job: "backup" }, "Bearer nope"))).status).toBe(401)
    expect(heartbeat).not.toHaveBeenCalled()
  })

  it("records a known job, rejects an unknown one", async () => {
    const res = await POST(post({ job: "backup", summary: { size: 1 } }, "Bearer s3cret"))
    expect(res.status).toBe(200)
    expect(heartbeat).toHaveBeenCalledWith("backup", true, { size: 1 }, undefined)
    const bad = await POST(post({ job: "mining" }, "Bearer s3cret"))
    expect(bad.status).toBe(400)
    const failed = await POST(post({ job: "restore-test", ok: false, error: "counts differ" }, "Bearer s3cret"))
    expect(failed.status).toBe(200)
    expect(heartbeat).toHaveBeenLastCalledWith("restore-test", false, undefined, "counts differ")
  })
})
