// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"

/**
 * Heartbeats of the scheduled jobs (#383). Cron routes wrap their work in `recordJobRun`; the
 * backup CronJobs and the manual restore test post `heartbeat` through /api/cron/heartbeat.
 * One row per job, the latest state only.
 */

export const JOBS = {
  reminders: { label: "Rappels", maxAgeHours: 2 },
  cleanup: { label: "Nettoyage nocturne", maxAgeHours: 26 },
  backup: { label: "Sauvegarde chiffrée", maxAgeHours: 26 },
  "backup-offsite": { label: "Copie hors site", maxAgeHours: 26 },
  "restore-test": { label: "Test de restauration", maxAgeHours: 24 * 90 },
} as const

export type JobName = keyof typeof JOBS
export const JOB_NAMES = Object.keys(JOBS) as JobName[]
export const isJobName = (v: string): v is JobName => v in JOBS

/** Runs `fn`, recording start, end, outcome and the summary it returns. Never hides the error. */
export async function recordJobRun<T>(job: JobName, fn: () => Promise<T>): Promise<T> {
  const startedAt = new Date()
  await prisma.jobRun.upsert({
    where: { job },
    create: { job, startedAt, finishedAt: null, ok: null, error: null },
    update: { startedAt, finishedAt: null, ok: null, error: null },
  })
  try {
    const result = await fn()
    await prisma.jobRun.update({ where: { job }, data: { finishedAt: new Date(), ok: true, error: null, summary: summaryOf(result) } })
    return result
  } catch (e) {
    await prisma.jobRun.update({ where: { job }, data: { finishedAt: new Date(), ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 500) } })
    throw e
  }
}

function summaryOf(v: unknown) {
  if (v === null || v === undefined || v instanceof Response) return undefined
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return undefined
  }
}

/** An external job reports its outcome: one call at the end, so start and end coincide. */
export async function heartbeat(job: JobName, ok: boolean, summary?: unknown, error?: string): Promise<void> {
  const now = new Date()
  const data = { startedAt: now, finishedAt: now, ok, error: ok ? null : (error ?? "échec").slice(0, 500), summary: summaryOf(summary) }
  await prisma.jobRun.upsert({ where: { job }, create: { job, ...data }, update: data })
}

export async function loadJobRuns() {
  const rows = await prisma.jobRun.findMany()
  return Object.fromEntries(rows.map((r) => [r.job, r])) as Partial<Record<JobName, (typeof rows)[number]>>
}
