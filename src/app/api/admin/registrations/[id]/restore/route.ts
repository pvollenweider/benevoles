// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { restoreRegistration } from "@/lib/registration-restore-action"
import { validationError } from "@/lib/api-error"
import { z } from "zod"

const schema = z.object({ newLink: z.boolean().optional() })

/** « Rétablir » a cancelled place or request (#809): only before the shift, only with a free spot. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const result = await restoreRegistration(guard.db, adminActor(guard.session), id, new Date(), { newLink: parsed.data.newLink })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  return NextResponse.json({ status: result.status })
}
