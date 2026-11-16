// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { isHostedService } from "@/lib/site"
import { AUTO_APPROVAL_HOSTED_ONLY, AUTO_APPROVAL_UNTIL_REFUSED, autoApprovalUntilError } from "@/lib/auto-approval"
import {
  AutoApprovalCeilingReachedError,
  AutoApprovalUntilRefusedError,
  disableAutoApproval,
  readAutoApprovalView,
  setAutoApprovalUntil,
} from "@/lib/auto-approval-server"

/**
 * « Validation automatique des nouveaux espaces » (#1371): super admin only, hosted service only.
 * `PUT { until }` turns it on or changes its end day; `DELETE` turns it off. Each decision is
 * written to the operator's log with the end day, and refused on a self-hosted instance.
 */

function hostedOnly(): NextResponse | null {
  if (isHostedService()) return null
  return NextResponse.json({ error: AUTO_APPROVAL_HOSTED_ONLY }, { status: 403 })
}

export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const hosted = hostedOnly()
  if (hosted) return hosted
  return NextResponse.json(await readAutoApprovalView())
}

export async function PUT(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const hosted = hostedOnly()
  if (hosted) return hosted

  const body = (await req.json().catch(() => null)) as { until?: unknown } | null
  const now = new Date()
  const problem = autoApprovalUntilError(body?.until, now)
  if (problem) return NextResponse.json({ error: problem, field: "until" }, { status: 400 })

  try {
    const view = await setAutoApprovalUntil((body!.until as string).trim(), guard.session.user, now)
    // Belt and braces: the server refuses before writing, and the response is only a success when
    // the stored value is read back as on (the screen relies on this to announce success).
    if (view.state !== "on") {
      return NextResponse.json({ error: AUTO_APPROVAL_UNTIL_REFUSED, field: "until" }, { status: 400 })
    }
    return NextResponse.json(view)
  } catch (e) {
    if (e instanceof AutoApprovalCeilingReachedError) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof AutoApprovalUntilRefusedError) {
      return NextResponse.json({ error: e.message, field: "until" }, { status: 400 })
    }
    throw e
  }
}

export async function DELETE() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const hosted = hostedOnly()
  if (hosted) return hosted
  return NextResponse.json(await disableAutoApproval(guard.session.user, new Date()))
}
