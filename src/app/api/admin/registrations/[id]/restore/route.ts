// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { restoreRegistration } from "@/lib/registration-restore-action"
import { validationError } from "@/lib/api-error"
import { z } from "zod"

const schema = z.object({
  newLink: z.boolean().optional(),
  /** Dated availability (#1146, lot B): the acknowledgement of hours the person said they are not available for. */
  availabilityAck: z.array(z.string().max(400)).max(1).optional(),
})

/** « Rétablir » a cancelled place or request (#809): only before the shift, only with a free spot. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const result = await restoreRegistration(guard.db, adminActor(guard.session), id, new Date(), { newLink: parsed.data.newLink, availabilityAck: parsed.data.availabilityAck })
  // A workload refusal (#1171) carries its findings for the page; a missing availability
  // acknowledgement (#1146, lot B) the shifts to acknowledge.
  if (!result.ok) {
    const body: Record<string, unknown> = { ...result }
    delete body.ok
    delete body.httpStatus
    return NextResponse.json(body, { status: result.httpStatus })
  }
  return NextResponse.json({ status: result.status })
}
