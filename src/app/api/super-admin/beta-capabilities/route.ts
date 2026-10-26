// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { readOpenBetaCapabilities, setOpenBetaCapabilities } from "@/lib/beta-access"
import { parseCapabilityRequest } from "@/lib/beta-capabilities"

/** The capabilities open for a beta trial (#1168): super admin only, effective at once. */
export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  return NextResponse.json({ open: await readOpenBetaCapabilities() })
}

/** Replaces the open list (`{ open: string[] }`); closing stops new adoptions only. */
export async function PUT(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const parsed = parseCapabilityRequest(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  return NextResponse.json({ open: await setOpenBetaCapabilities(parsed.open, guard.session.user) })
}
