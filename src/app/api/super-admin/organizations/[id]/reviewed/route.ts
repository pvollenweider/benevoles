// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { isHostedService } from "@/lib/site"
import { AUTO_APPROVAL_HOSTED_ONLY } from "@/lib/auto-approval"
import { markAutoApprovalReviewed } from "@/lib/auto-approval-server"

/**
 * « Marquer comme relu » on a space the automatic validation approved (#1371): super admin only,
 * logged. The mark itself (`autoApprovedAt`) stays; this only records that the operator reread it.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  if (!isHostedService()) return NextResponse.json({ error: AUTO_APPROVAL_HOSTED_ONLY }, { status: 403 })
  const { id } = await params
  const result = await markAutoApprovalReviewed(id, guard.session.user, new Date())
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
