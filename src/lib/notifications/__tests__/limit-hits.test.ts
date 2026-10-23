import { describe, it, expect, vi } from "vitest"

const report = vi.hoisted(() => vi.fn())
vi.mock("@/lib/report-error", () => ({ reportError: () => report }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { bestEffort, hourStart, limitHitBucket, recordLimitHit } from "../limit-hits"

// #1100: one row per limit, organisation and UTC hour; nothing about the recipient.
describe("recordLimitHit", () => {
  const now = new Date("2026-10-23T21:04:31.500Z")

  it("keys a row by limit, organisation or platform, and UTC hour", () => {
    expect(limitHitBucket("org_per_minute", "org1", now)).toBe("org_per_minute:org1:2026-10-23T21")
    expect(limitHitBucket("signup_per_hour", null, now)).toBe("signup_per_hour:platform:2026-10-23T21")
    expect(hourStart(now).toISOString()).toBe("2026-10-23T21:00:00.000Z")
  })

  it("adds a held email to its hour's row with one atomic upsert, and only counts", async () => {
    const upsert = vi.fn().mockResolvedValue({})
    await recordLimitHit({ organizationId: "org1", limit: "org_per_minute", outcome: "held", now }, { emailLimitHit: { upsert } as never })
    expect(upsert).toHaveBeenCalledWith({
      where: { bucket: "org_per_minute:org1:2026-10-23T21" },
      create: { bucket: "org_per_minute:org1:2026-10-23T21", organizationId: "org1", limit: "org_per_minute", hourStart: new Date("2026-10-23T21:00:00Z"), heldCount: 1, refusedCount: 0, firstAt: now, lastAt: now },
      update: { heldCount: { increment: 1 }, refusedCount: { increment: 0 }, lastAt: now },
    })
  })

  it("counts a refused email apart, a platform one without organisation", async () => {
    const upsert = vi.fn().mockResolvedValue({})
    await recordLimitHit({ organizationId: undefined, limit: "signup_per_hour", outcome: "refused", now }, { emailLimitHit: { upsert } as never })
    expect(upsert.mock.calls[0][0].create).toMatchObject({ organizationId: null, heldCount: 0, refusedCount: 1 })
    expect(upsert.mock.calls[0][0].update).toMatchObject({ heldCount: { increment: 0 }, refusedCount: { increment: 1 } })
  })

  it("reports a failure and never throws: recording never changes a send", async () => {
    const upsert = vi.fn().mockRejectedValue(new Error("db down"))
    await expect(recordLimitHit({ organizationId: "org1", limit: "org_per_day", outcome: "held", now }, { emailLimitHit: { upsert } as never })).resolves.toBeUndefined()
    expect(report).toHaveBeenCalled()
  })

  // Codex review: neither a throwing reporter nor a blocked write may reach the send.
  it("swallows a reporter that throws too", async () => {
    report.mockImplementationOnce(() => { throw new Error("sentry down") })
    const upsert = vi.fn().mockRejectedValue(new Error("db down"))
    await expect(recordLimitHit({ organizationId: "org1", limit: "org_per_day", outcome: "held", now }, { emailLimitHit: { upsert } as never })).resolves.toBeUndefined()
  })

  it("stops waiting for a step slower than its time bound", async () => {
    vi.useFakeTimers()
    try {
      const done = bestEffort("test.slow", () => new Promise(() => {}), 50)
      await vi.advanceTimersByTimeAsync(60)
      await expect(done).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("survives a step that throws synchronously", async () => {
    await expect(bestEffort("test.sync", () => { throw new Error("boom") })).resolves.toBeUndefined()
  })
})
