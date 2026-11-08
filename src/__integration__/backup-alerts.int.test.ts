// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, afterEach, afterAll } from "vitest"

/**
 * F-04 against a real Postgres: the nightly cleanup reads the backup JobRuns and queues the
 * operator alert through the real outbox (SMTP is never reached: `after` is mocked and ntfy is
 * off without NTFY_URL). One alert for a stale backup, no second one the same day, none once the
 * backup is fresh again.
 */

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }))

import { prisma } from "@/lib/prisma"

const url = process.env.DATABASE_URL
const HOUR = 3_600_000

process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long"
process.env.CRON_SECRET = "test-cron"
process.env.OPERATOR_ALERT_EMAIL = "alerts@example.org"
delete process.env.NTFY_URL

describe.skipIf(!url)("backup alerts through the nightly cleanup (F-04)", () => {
  afterEach(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { dedupeKey: { startsWith: "operator_alert:backup-alert:" } } })
    await prisma.jobRun.deleteMany({ where: { job: { in: ["backup", "backup-offsite", "restore-test", "cleanup"] } } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("queues one alert for a stale backup, none again the same day, none for a fresh one", async () => {
    await prisma.jobRun.deleteMany({ where: { job: { in: ["backup", "backup-offsite", "restore-test"] } } })
    const now = new Date()
    const stale = new Date(now.getTime() - 30 * HOUR)
    await prisma.jobRun.create({ data: { job: "backup", startedAt: stale, finishedAt: stale, ok: true } })

    const { GET } = await import("@/app/api/cron/cleanup/route")
    const call = () => GET(new Request("http://localhost/api/cron/cleanup", { headers: { authorization: "Bearer test-cron" } }))
    const alertRows = () => prisma.notificationOutbox.findMany({ where: { dedupeKey: { startsWith: "operator_alert:backup-alert:backup:" } } })

    const first = await call()
    expect(first.status).toBe(200)
    expect(((await first.json()) as { backupAlerts: number }).backupAlerts).toBe(1)
    expect(await alertRows()).toHaveLength(1)

    const second = await call()
    expect(second.status).toBe(200)
    expect(((await second.json()) as { backupAlerts: number }).backupAlerts).toBe(1)
    expect(await alertRows()).toHaveLength(1)

    await prisma.jobRun.update({ where: { job: "backup" }, data: { startedAt: now, finishedAt: now, ok: true } })
    const third = await call()
    expect(third.status).toBe(200)
    expect(((await third.json()) as { backupAlerts: number }).backupAlerts).toBe(0)
    expect(await alertRows()).toHaveLength(1)
  })
})
