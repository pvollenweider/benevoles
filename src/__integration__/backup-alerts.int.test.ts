// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, afterEach, afterAll } from "vitest"

/**
 * F-04 against a real Postgres: the nightly cleanup reads the backup JobRuns and queues the
 * operator alert through the real outbox. SMTP is never reached (`after` is mocked), the ntfy
 * fetch is counted, and the first row is marked sent by hand to reproduce a real delivery.
 * One alert for a stale backup; a same-day rerun sends neither push nor email because the sent
 * row is kept seven days; the next day has a new key and a new alert.
 */

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }))

import { prisma } from "@/lib/prisma"

const url = process.env.DATABASE_URL
const HOUR = 3_600_000
const DAY = 24 * HOUR

process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long"
process.env.CRON_SECRET = "test-cron"
process.env.OPERATOR_ALERT_EMAIL = "alerts@example.org"
process.env.NTFY_URL = "https://ntfy.sh/benevol-test-integration"

describe.skipIf(!url)("backup alerts through the nightly cleanup (F-04)", () => {
  afterEach(async () => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    await prisma.notificationOutbox.deleteMany({ where: { dedupeKey: { startsWith: "operator_alert:backup-alert:" } } })
    await prisma.jobRun.deleteMany({ where: { job: { in: ["backup", "backup-offsite", "restore-test", "cleanup"] } } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("sends one push and one email for a stale backup, nothing on a same-day rerun, again the next day", async () => {
    await prisma.jobRun.deleteMany({ where: { job: { in: ["backup", "backup-offsite", "restore-test"] } } })
    const ntfy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", ntfy)

    const now = new Date()
    const stale = new Date(now.getTime() - 30 * HOUR)
    await prisma.jobRun.create({ data: { job: "backup", startedAt: stale, finishedAt: stale, ok: true } })

    const { GET } = await import("@/app/api/cron/cleanup/route")
    const call = () => GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer test-cron" } }))
    const alertRows = () => prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: "operator_alert:backup-alert:backup:" } }, orderBy: { createdAt: "asc" } })

    const first = await call()
    expect(first.status).toBe(200)
    expect(((await first.json()) as { backupAlerts: number }).backupAlerts).toBe(1)
    expect(ntfy).toHaveBeenCalledTimes(1)
    expect(await alertRows()).toHaveLength(1)

    // The email is delivered after the response in production; mark the row sent as the outbox would.
    await prisma.notificationOutbox.updateMany({
      where: { dedupeKey: { startsWith: "operator_alert:backup-alert:backup:" } },
      data: { status: "sent", sentAt: new Date() },
    })

    const second = await call()
    expect(second.status).toBe(200)
    expect(((await second.json()) as { backupAlerts: number }).backupAlerts).toBe(1)
    expect(ntfy).toHaveBeenCalledTimes(1)
    const sameDay = await alertRows()
    expect(sameDay).toHaveLength(1)
    expect(sameDay[0].status).toBe("sent")

    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(now.getTime() + DAY))
    const nextDay = await call()
    expect(nextDay.status).toBe(200)
    expect(((await nextDay.json()) as { backupAlerts: number }).backupAlerts).toBe(1)
    expect(ntfy).toHaveBeenCalledTimes(2)
    expect(await alertRows()).toHaveLength(2)

    await prisma.jobRun.update({ where: { job: "backup" }, data: { startedAt: new Date(), finishedAt: new Date(), ok: true } })
    const fresh = await call()
    expect(fresh.status).toBe(200)
    expect(((await fresh.json()) as { backupAlerts: number }).backupAlerts).toBe(0)
    expect(ntfy).toHaveBeenCalledTimes(2)
    expect(await alertRows()).toHaveLength(2)
  })
})
