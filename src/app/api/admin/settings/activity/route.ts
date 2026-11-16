// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { listOrgLogs } from "@/lib/org-log-read"
import { loadSendBatches } from "@/lib/send-batches-data"
import { batchSummary, type ActivityBatch } from "@/lib/send-batches"

/**
 * Org-level activity log (#194) — Member and AdminUser changes, not tied to one event.
 *   ?entityType=Member|AdminUser
 *   ?action=member             prefix match (member.created, member.updated, ...)
 *   ?cursor=<logId>&limit=50   pagination
 */
export async function GET(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const url = new URL(req.url)
  const limitParam = url.searchParams.get("limit")

  const { entries, nextCursor } = await listOrgLogs(organizationId, {
    entityType: url.searchParams.get("entityType") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
  })

  // A batch of emails (#1101) is shown with its delivery as it is now, read for this page only.
  // A batch deleted since (its event, or past its three years) has no details left.
  const batchIds = entries.filter((e) => e.entityType === "SendBatch").map((e) => e.entityId)
  const batches = new Map((await loadSendBatches(organizationId, { ids: batchIds, limit: batchIds.length })).map((b) => [b.id, b]))
  const withBatches = entries.map((e) => {
    const b = e.entityType === "SendBatch" ? batches.get(e.entityId) : undefined
    const batch: ActivityBatch | null = b ? { kindLabel: b.kindLabel, eventId: b.eventId, eventTitle: b.eventTitle, summary: batchSummary(b.delivery), heldSentence: b.heldSentence } : null
    return { ...e, batch }
  })

  return NextResponse.json({ entries: withBatches, nextCursor })
}
