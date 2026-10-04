// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logOrgEvent } from "@/lib/org-log"

/**
 * Logs the generation of a volunteer certificate (#556): action and actor only, no period, no
 * figures and no free text in `changes` — the owner's decision on #556 was to keep this entry
 * free of personal data. Called once, from an explicit "Générer et imprimer" click
 * (src/components/admin/CertificateView.tsx), never on every re-render of the preview: changing
 * the period or the checkbox only recomputes client-side state, with no request to this route.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const member = await guard.db.volunteer.findFirst({ where: { id }, select: { id: true } })
  if (!member) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await logOrgEvent({
    organizationId: guard.organizationId,
    actor: adminActor(guard.session),
    action: "volunteer.certificate_generated",
    entityType: "Member",
    entityId: id,
  })

  return NextResponse.json({ ok: true })
}
