// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { retryOutboxRow } from "@/lib/outbox-data"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { logOrgEvent } from "@/lib/org-log"
import { adminActor } from "@/lib/event-log"

/** Re-queues a permanently failed notification of the organization (#382) and delivers it after the response. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId, session } = guard
  const { id } = await params

  const ok = await retryOutboxRow(id, organizationId)
  if (!ok) return NextResponse.json({ error: "Cet email ne peut pas être renvoyé : introuvable, pas en échec, ou remplacé par un envoi plus récent du même email." }, { status: 404 })

  await logOrgEvent({ organizationId, actor: adminActor(session), action: "notification.retried", entityType: "NotificationOutbox", entityId: id })
  deliverAfterResponse([id])
  return NextResponse.json({ ok: true })
}
