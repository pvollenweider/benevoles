import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { listOrgLogs } from "@/lib/org-log-read"

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

  return NextResponse.json({ entries, nextCursor })
}
