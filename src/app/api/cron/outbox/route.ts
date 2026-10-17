// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { recordJobRun } from "@/lib/job-runs"
import { env } from "@/lib/env"
import { isCronAuthorized } from "@/lib/cron-auth"
import { deliverOutbox } from "@/lib/notifications/outbox"
import { dispatchScheduledMessages } from "@/lib/scheduled-message-dispatch"
import { reportError } from "@/lib/report-error"

export const dynamic = "force-dynamic"

// Same auth as the other cron routes: `Authorization: Bearer <CRON_SECRET>`, localhost in dev.
function isAuthorized(req: Request): boolean {
  return isCronAuthorized(req, env.CRON_SECRET)
}

/**
 * Every 5 minutes (k8s/cronjob-outbox.yaml): sends the emails that became due, chiefly the grouped
 * « added by an organizer » email (#916), which waits a few minutes after the last add. The hourly
 * reminders run still retries failed sends too. First, the scheduled messages that became due
 * (#1019) are turned into queued emails, delivered in the same run.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const scheduled = await dispatchScheduledMessages().catch((e) => {
    reportError("scheduled_message.cron")(e)
    return null
  })
  const outbox = await recordJobRun("outbox", () => deliverOutbox())
  return NextResponse.json({ scheduled, outbox })
}
