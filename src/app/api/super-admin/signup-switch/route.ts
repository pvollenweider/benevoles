// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { readSignupSwitch, setSignupClosed } from "@/lib/signup-switch"

/** The « Inscriptions fermées » switch (#810): super admin only, effective at once. */
export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  return NextResponse.json(await readSignupSwitch())
}

export async function PUT(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const body = (await req.json().catch(() => null)) as { closed?: unknown } | null
  if (typeof body?.closed !== "boolean") return NextResponse.json({ error: "Indiquez s'il faut fermer ou rouvrir les inscriptions." }, { status: 400 })
  return NextResponse.json(await setSignupClosed(body.closed, guard.session.user))
}
