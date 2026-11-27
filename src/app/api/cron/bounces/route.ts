// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { isCronAuthorized } from "@/lib/cron-auth"
import { processDeferredBounces } from "@/lib/bounce-mailbox"
import { runAddressAlerts } from "@/lib/address-alert-data"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { reportError } from "@/lib/report-error"

export const dynamic = "force-dynamic"

/**
 * Deferred bounces (#602): every 15 minutes (k8s/cronjob-bounces.yaml), reads the notifications
 * mailbox over IMAPS, records a permanent refusal as the same `rejected_permanent` outcome an
 * immediate refusal records (#598, #599), and moves the processed DSN out of the inbox. Without
 * IMAP settings the route is a no-op; the health page shows « Rejets différés » as unconfigured.
 * Same auth as the other cron routes: `Authorization: Bearer <CRON_SECRET>`, localhost in dev.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const result = await processDeferredBounces()
  // Right after the bounces are recorded (#1476): tell the organisers at once when someone whose
  // address has just failed is expected soon. Runs without IMAP settings too: an immediate refusal
  // by our relay is recorded at send time. A failure here never hides the bounce run's result.
  const addressAlerts = await runAddressAlerts()
    .then((ids) => { deliverAfterResponse(ids); return ids.length })
    .catch((e) => { reportError("bounces.address_alerts")(e); return 0 })
  return NextResponse.json({ ...result, addressAlerts })
}
