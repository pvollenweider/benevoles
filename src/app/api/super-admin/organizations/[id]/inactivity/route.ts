// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { logOperator, organizationTarget } from "@/lib/operator-log"
import { isPostponeMonths, postponedUntil } from "@/lib/org-inactivity"
import { prisma } from "@/lib/prisma"
import { APP_TIME_ZONE } from "@/lib/time-zone"

/**
 * The operator's hand on the periodic check of inactive organisations (#811): postpone it by 3,
 * 6 or 12 months from today (`postponeMonths`), cancel the postponement (`postponeMonths: null`),
 * or exclude the organisation for good (`exempt`). Super admin only, logged in the operator log.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const body = (await req.json().catch(() => null)) as { postponeMonths?: unknown; exempt?: unknown } | null
  if (body === null || typeof body !== "object") return NextResponse.json({ error: "Indiquez un report ou une exclusion." }, { status: 400 })
  const hasPostpone = "postponeMonths" in body
  const hasExempt = "exempt" in body
  if (hasPostpone === hasExempt) return NextResponse.json({ error: "Indiquez un report ou une exclusion, pas les deux." }, { status: 400 })
  if (hasPostpone && body.postponeMonths !== null && !isPostponeMonths(body.postponeMonths)) {
    return NextResponse.json({ error: "Choisissez un report de 3, 6 ou 12 mois." }, { status: 400 })
  }
  if (hasExempt && typeof body.exempt !== "boolean") return NextResponse.json({ error: "Indiquez s'il faut exclure l'organisation ou non." }, { status: 400 })

  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, slug: true } })
  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const now = new Date()
  const until = hasPostpone && isPostponeMonths(body.postponeMonths) ? postponedUntil(now, body.postponeMonths) : null
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({
      where: { id },
      data: hasPostpone ? { inactivityPostponedUntil: until } : { inactivityExempt: body.exempt as boolean },
      select: { inactivityPostponedUntil: true, inactivityExempt: true },
    })
    await logOperator(tx, {
      action: hasPostpone
        ? (until ? "organization.inactivity_postponed" : "organization.inactivity_postponement_cancelled")
        : (body.exempt ? "organization.inactivity_exempted" : "organization.inactivity_exemption_lifted"),
      actor: guard.session.user,
      entityType: "Organization",
      entityId: id,
      target: organizationTarget(org),
      detail: until ? `Jusqu'au ${until.toLocaleDateString("fr-FR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "long", year: "numeric" })}` : null,
    })
    return row
  })

  return NextResponse.json({ postponedUntil: updated.inactivityPostponedUntil?.toISOString() ?? null, exempt: updated.inactivityExempt })
}
