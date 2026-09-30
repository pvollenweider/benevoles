// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { decideRequest, decisionSchema } from "@/lib/registration-decision"

/** Accept or refuse a sign-up request on a « Sur validation » shift (#484). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const parsed = decisionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  const result = await decideRequest(guard.db, adminActor(guard.session), id, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  return NextResponse.json({ status: result.status })
}
