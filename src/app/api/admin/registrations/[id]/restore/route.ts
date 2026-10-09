// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { restoreRegistration } from "@/lib/registration-restore-action"

/** « Rétablir » a cancelled place or request (#809): only before the shift, only with a free spot. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const result = await restoreRegistration(guard.db, adminActor(guard.session), id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  return NextResponse.json({ status: result.status })
}
