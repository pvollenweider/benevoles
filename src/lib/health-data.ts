// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { readdirSync } from "node:fs"
import { join } from "node:path"
import { prisma } from "./prisma"
import { env, releaseCheckEnabled } from "./env"
import { outboxHealth } from "./notifications/outbox"
import { JOBS, loadJobRuns, type JobName } from "./job-runs"
import {
  assessConfig, assessDatabase, assessJob, assessMigrations, assessOutbox, assessReleaseCheck, assessRestoreTest, type HealthItem, type MigrationFacts,
} from "./health-view"
import { isNewerVersion } from "./release-check"
import pkg from "../../package.json"

/**
 * Facts for the super-admin health page (#383), each gathered independently so one failing
 * probe (the database first of all) doesn't hide the others.
 */
export async function loadHealth(now: Date = new Date()) {
  const database = await probeDatabase()
  const none: Awaited<ReturnType<typeof loadJobRuns>> = {}
  const [outbox, runs, migrations, releaseState] = database === null
    ? [null, none, null, null]
    : await Promise.all([
        outboxHealth(now).catch(() => null),
        loadJobRuns().catch(() => none),
        probeMigrations().catch(() => null),
        prisma.releaseCheckState.findUnique({ where: { id: "singleton" } }).catch(() => null),
      ])

  const jobs: HealthItem[] = (Object.keys(JOBS) as JobName[])
    .filter((j) => j !== "restore-test")
    .map((j) => assessJob(JOBS[j].label, runs[j] ?? null, now, JOBS[j].maxAgeHours))
  jobs.push(assessRestoreTest(runs["restore-test"] ?? null, now))

  const version = pkg.version as string
  const items: HealthItem[] = [
    assessDatabase(database),
    outbox ? assessOutbox(outbox) : { id: "outbox", label: "File d'envoi des emails", level: "unknown", detail: "Non lue." },
    assessReleaseCheck(
      {
        enabled: releaseCheckEnabled(),
        latestVersion: releaseState?.latestVersion ?? null,
        lastCheckedAt: releaseState?.lastCheckedAt ?? null,
        isNewer: isNewerVersion(releaseState?.latestVersion ?? null, version),
      },
      version,
      now,
    ),
    ...jobs,
    migrations ? assessMigrations(migrations) : { id: "migrations", label: "Migrations de la base", level: "unknown", detail: "Non lues." },
    ...assessConfig({
      smtp: !!process.env.SMTP_HOST,
      push: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      cronSecret: !!env.CRON_SECRET,
      tokenEncryption: !!env.TOKEN_ENCRYPTION_KEY?.trim(),
      sentry: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    }),
  ]
  return { items, version, gitSha: env.GIT_SHA ?? null, migrations, checkedAt: now }
}

async function probeDatabase(): Promise<number | null> {
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return Date.now() - t0
  } catch {
    return null
  }
}

/** Applied migrations from Prisma's own table, pending ones from the files shipped with the build. */
async function probeMigrations(): Promise<MigrationFacts> {
  const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY finished_at DESC NULLS FIRST`
  const applied = new Set(rows.filter((r) => r.finished_at).map((r) => r.migration_name))
  let onDisk: string[] = []
  try {
    onDisk = readdirSync(join(process.cwd(), "prisma", "migrations")).filter((n) => /^\d{14}_/.test(n))
  } catch {
    onDisk = [] // image without the migrations folder: pending can't be known, reported as 0
  }
  const last = rows.find((r) => r.finished_at) ?? null
  return { applied: applied.size, lastName: last?.migration_name ?? null, lastAt: last?.finished_at ?? null, pending: onDisk.filter((n) => !applied.has(n)).length }
}
