import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), findMany: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: { jobRun: m } }))

import { heartbeat, isJobName, loadJobRuns, recordJobRun } from "../job-runs"

// Heartbeats of the scheduled jobs (#383).
describe("job runs", () => {
  beforeEach(() => { for (const fn of Object.values(m)) fn.mockReset() })

  it("records start, then success with the summary", async () => {
    const out = await recordJobRun("cleanup", async () => ({ deleted: 3 }))
    expect(out).toEqual({ deleted: 3 })
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { job: "cleanup" }, update: expect.objectContaining({ finishedAt: null, ok: null }) }))
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { job: "cleanup" }, data: expect.objectContaining({ ok: true, summary: { deleted: 3 } }) }))
  })

  it("records the failure and rethrows; a Response result has no summary", async () => {
    await expect(recordJobRun("reminders", async () => { throw new Error("smtp down") })).rejects.toThrow("smtp down")
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ok: false, error: "smtp down" }) }))
    await recordJobRun("reminders", async () => new Response("{}"))
    expect(m.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ ok: true, summary: undefined }) }))
  })

  it("heartbeat upserts one row with start and end together; names are checked", async () => {
    await heartbeat("backup", true, { size: 12 })
    const call = m.upsert.mock.calls[0][0]
    expect(call.where).toEqual({ job: "backup" })
    expect(call.update).toMatchObject({ ok: true, error: null, summary: { size: 12 } })
    expect(call.update.startedAt).toEqual(call.update.finishedAt)
    await heartbeat("restore-test", false, undefined, "counts differ")
    expect(m.upsert.mock.calls[1][0].update).toMatchObject({ ok: false, error: "counts differ" })
    expect(isJobName("backup")).toBe(true)
    expect(isJobName("mining")).toBe(false)
  })

  it("loads runs keyed by job", async () => {
    m.findMany.mockResolvedValue([{ job: "cleanup", ok: true }, { job: "backup", ok: false }])
    const runs = await loadJobRuns()
    expect(Object.keys(runs)).toEqual(["cleanup", "backup"])
    expect(runs.backup).toMatchObject({ ok: false })
  })
})
