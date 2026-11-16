// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { JOBS, type JobName } from "./job-runs"
import { assessJob, assessRestoreTest, type JobRunFacts } from "./health-view"
import { siteName } from "./site"

/**
 * F-04: automatic alerts for the backups. The nightly cleanup runs after both backup CronJobs
 * (01:00 and 01:30 UTC), so it can read their last JobRun and alert the operator when one failed
 * or is overdue.
 *
 * The thresholds are the health page's: `JOBS[job].maxAgeHours` for the backups, and the 45/90-day
 * rule of `assessRestoreTest`. Only an `error` alerts; the 45-day warning stays on the page.
 * A job with no JobRun at all stays silent: a Docker Compose installation has no backup CronJob,
 * and must not receive a daily « never ran » alert.
 *
 * The key carries the UTC day: one alert per job and per day, so a broken backup is recalled
 * every night without flooding the operator.
 */
const WATCHED = ["backup", "backup-offsite", "restore-test"] as const satisfies readonly JobName[]

export type BackupAlert = {
  key: string
  title: string
  message: string
  priority: 4
  /** Absolute when NEXT_PUBLIC_APP_URL is set, else the path. */
  url: string
}

export function backupAlerts(
  runs: Partial<Record<JobName, JobRunFacts | null | undefined>>,
  now: Date,
  healthUrl: string,
): BackupAlert[] {
  const day = now.toISOString().slice(0, 10)
  const alerts: BackupAlert[] = []

  for (const job of WATCHED) {
    const run = runs[job]
    // Never recorded: no alert (self-hosted Compose has no backup job).
    if (!run) continue
    // JobRun.error is arbitrary script output; the alert keeps the health page's timing and
    // reason, never that text (no personal data in an operator alert).
    const safeRun = run.error === null ? run : { ...run, error: null }
    const item = job === "restore-test"
      ? assessRestoreTest(safeRun, now)
      : assessJob(JOBS[job].label, safeRun, now, JOBS[job].maxAgeHours)
    if (item.level !== "error") continue

    alerts.push({
      key: `backup-alert:${job}:${day}`,
      title: `${siteName()} : ${JOBS[job].label} à vérifier`,
      message: `${item.detail} Page de santé : ${healthUrl}`,
      priority: 4,
      url: healthUrl,
    })
  }

  return alerts
}
