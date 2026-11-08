// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { backupAlerts } from "../backup-alerts"
import type { JobRunFacts } from "../health-view"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = new Date("2026-11-08T02:00:00Z")
const HEALTH = "https://www.benevol.app/super-admin/health"

function run(overrides: Partial<JobRunFacts> = {}): JobRunFacts {
  return {
    job: "backup",
    startedAt: new Date(NOW.getTime() - HOUR),
    finishedAt: new Date(NOW.getTime() - HOUR),
    ok: true,
    error: null,
    ...overrides,
  }
}

const alertsFor = (runs: Parameters<typeof backupAlerts>[0], now: Date = NOW) => backupAlerts(runs, now, HEALTH)

describe("backupAlerts (F-04)", () => {
  it("says nothing when the backup is fresh", () => {
    expect(alertsFor({ backup: run() })).toEqual([])
  })

  it("alerts once when the backup is overdue", () => {
    const alerts = alertsFor({ backup: run({ startedAt: new Date(NOW.getTime() - 30 * HOUR), finishedAt: new Date(NOW.getTime() - 30 * HOUR) }) })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ key: "backup-alert:backup:2026-11-08", priority: 4, url: HEALTH })
    expect(alerts[0].message).toContain("/super-admin/health")
    expect(alerts[0].message).toContain("26 h")
  })

  it("alerts once when the last backup failed", () => {
    const alerts = alertsFor({ backup: run({ ok: false, error: "dump failed" }) })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe("backup-alert:backup:2026-11-08")
  })

  it("says nothing when the job was never recorded, so Compose stays silent", () => {
    expect(alertsFor({})).toEqual([])
    expect(alertsFor({ backup: null })).toEqual([])
    expect(alertsFor({ backup: run({ finishedAt: null, startedAt: new Date(NOW.getTime() - HOUR) }) })).toEqual([])
  })

  it("does not alert for the 45-day restore-test warning", () => {
    const alerts = alertsFor({ "restore-test": run({ job: "restore-test", finishedAt: new Date(NOW.getTime() - 50 * DAY) }) })
    expect(alerts).toEqual([])
  })

  it("alerts for a restore test older than 90 days", () => {
    const alerts = alertsFor({ "restore-test": run({ job: "restore-test", finishedAt: new Date(NOW.getTime() - 95 * DAY) }) })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe("backup-alert:restore-test:2026-11-08")
  })

  it("alerts for a failed restore test", () => {
    const alerts = alertsFor({ "restore-test": run({ job: "restore-test", ok: false }) })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe("backup-alert:restore-test:2026-11-08")
  })

  it("covers the off-site copy too", () => {
    const alerts = alertsFor({ "backup-offsite": run({ job: "backup-offsite", ok: false }) })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].key).toBe("backup-alert:backup-offsite:2026-11-08")
  })

  it("uses the same key the same day, and another one the next day", () => {
    const stale = run({ finishedAt: new Date(NOW.getTime() - 30 * HOUR), startedAt: new Date(NOW.getTime() - 30 * HOUR) })
    const today = alertsFor({ backup: stale })
    const again = alertsFor({ backup: stale })
    const tomorrow = alertsFor({ backup: stale }, new Date(NOW.getTime() + DAY))
    expect(again[0].key).toBe(today[0].key)
    expect(tomorrow[0].key).toBe("backup-alert:backup:2026-11-09")
    expect(tomorrow[0].key).not.toBe(today[0].key)
  })
})
