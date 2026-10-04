// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { dismissDuplicateSchema } from "@/lib/member-duplicates-schema"
import { signalsFingerprint } from "@/lib/member-duplicates"
import { adminActor } from "@/lib/event-log"
import { logOrgEvent } from "@/lib/org-log"

/**
 * Dismisses a possible-duplicate pair (#601): organizer level (same as the view itself — only the
 * merge it points to is owner-only). The fingerprint is recomputed here from the signal kinds the
 * client sent, never trusted as an opaque client value, and stores nothing beyond ids and signal
 * kinds (no personal data, see prisma/schema.prisma's DuplicateDismissal doc comment).
 */
export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const body = await req.json().catch(() => null)
  const parsed = dismissDuplicateSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { volunteerIdA, volunteerIdB, signals } = parsed.data
  if (volunteerIdA === volunteerIdB) return NextResponse.json({ error: "Paire invalide." }, { status: 400 })

  const [idA, idB] = volunteerIdA < volunteerIdB ? [volunteerIdA, volunteerIdB] : [volunteerIdB, volunteerIdA]
  const a = await db.volunteer.findFirst({ where: { id: idA }, select: { id: true } })
  const b = await db.volunteer.findFirst({ where: { id: idB }, select: { id: true } })
  if (!a || !b) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const fingerprint = signalsFingerprint(signals)
  const actor = adminActor(session)
  await db.duplicateDismissal.upsert({
    where: { organizationId_volunteerIdA_volunteerIdB_signalsFingerprint: { organizationId, volunteerIdA: idA, volunteerIdB: idB, signalsFingerprint: fingerprint } },
    create: { organizationId, volunteerIdA: idA, volunteerIdB: idB, signalsFingerprint: fingerprint, dismissedBy: actor.type === "admin" ? actor.id : null },
    update: { dismissedAt: new Date() },
  })

  await logOrgEvent({
    organizationId,
    actor,
    action: "member.duplicate_dismissed",
    entityType: "Member",
    entityId: idA,
    changes: { otherId: { from: null, to: idB }, signals: { from: null, to: signals.join("+") } },
  })

  return NextResponse.json({ ok: true })
}
