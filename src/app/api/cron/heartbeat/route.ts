// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { env } from "@/lib/env"
import { heartbeat, isJobName, JOB_NAMES } from "@/lib/job-runs"
import { validationError } from "@/lib/api-error"

const schema = z.object({
  job: z.string().refine(isJobName, `job doit être l'un de : ${JOB_NAMES.join(", ")}`),
  ok: z.boolean().default(true),
  error: z.string().max(500).optional(),
  summary: z.record(z.string(), z.unknown()).optional(),
})

// Same rule as the other cron routes: Bearer CRON_SECRET, localhost in dev only.
function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET
  if (expected) return req.headers.get("authorization") === `Bearer ${expected}`
  if (process.env.NODE_ENV === "production") return false
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

/** Heartbeat of a job that runs outside the app (#383): the backup CronJobs, the manual restore test. */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { job, ok, error, summary } = parsed.data
  if (!isJobName(job)) return NextResponse.json({ error: "job inconnu" }, { status: 400 })
  await heartbeat(job, ok, summary, error)
  return NextResponse.json({ ok: true, job, recordedAt: new Date().toISOString() })
}
