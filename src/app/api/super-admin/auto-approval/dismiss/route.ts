// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { isHostedService } from "@/lib/site"
import { AUTO_APPROVAL_HOSTED_ONLY } from "@/lib/auto-approval"
import { dismissAutoApprovalNotice } from "@/lib/auto-approval-server"

/** « Masquer cet avis »: acknowledges the cut-off notice; the option itself stays cut off. */
export async function POST() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  if (!isHostedService()) return NextResponse.json({ error: AUTO_APPROVAL_HOSTED_ONLY }, { status: 403 })
  return NextResponse.json(await dismissAutoApprovalNotice(new Date()))
}
