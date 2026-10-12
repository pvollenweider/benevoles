// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { recordJobRun } from "@/lib/job-runs"
import { env } from "@/lib/env"
import { deliverOutbox } from "@/lib/notifications/outbox"

export const dynamic = "force-dynamic"

// Same auth as the other cron routes: `Authorization: Bearer <CRON_SECRET>`, localhost in dev.
function isAuthorized(req: Request): boolean {
  const expected = env.CRON_SECRET
  if (expected) return req.headers.get("authorization") === `Bearer ${expected}`
  if (process.env.NODE_ENV === "production") return false
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

/**
 * Every 5 minutes (k8s/cronjob-outbox.yaml): sends the emails that became due, chiefly the grouped
 * « added by an organizer » email (#916), which waits a few minutes after the last add. The hourly
 * reminders run still retries failed sends too.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const outbox = await recordJobRun("outbox", () => deliverOutbox())
  return NextResponse.json({ outbox })
}
