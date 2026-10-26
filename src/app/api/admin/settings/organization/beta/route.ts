// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { readOpenBetaCapabilities } from "@/lib/beta-access"
import { decideBetaOptIn } from "@/lib/beta-capabilities"
// The Organization row isn't a tenant-scoped model: read and written by its own id, from the session.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

/**
 * « Essayer les fonctions avancées en bêta » (#1168): an owner joins or leaves the beta for the
 * whole organisation. Owner only (src/lib/permissions.ts). Logged in the organisation's activity
 * with its author. Changes no event and sends nothing: leaving only blocks new adoptions.
 */
export async function PUT(req: Request) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { organizationId, session } = guard

  const body = await req.json().catch(() => null)
  const [org, open] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { betaOptInAt: true } }),
    readOpenBetaCapabilities(),
  ])
  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

  const decision = decideBetaOptIn(!!org.betaOptInAt, body, open)
  if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status })

  if (decision.change) {
    const optIn = decision.change === "opt_in"
    // Conditional on the current state: two owners clicking at once write (and log) one change.
    const { count } = await prisma.organization.updateMany({
      where: { id: organizationId, betaOptInAt: optIn ? null : { not: null } },
      data: optIn ? { betaOptInAt: new Date(), betaOptInById: session.user?.id ?? null } : { betaOptInAt: null, betaOptInById: null },
    })
    if (count > 0) {
      await logOrgEvent({
        organizationId,
        actor: adminActor(session),
        action: optIn ? "organization.beta_opted_in" : "organization.beta_opted_out",
        entityType: "Organization",
        entityId: organizationId,
        changes: { betaOptIn: { from: !optIn, to: optIn } },
      })
    }
  }

  const after = await prisma.organization.findUnique({ where: { id: organizationId }, select: { betaOptInAt: true, betaOptInById: true } })
  const by = after?.betaOptInById
    ? await guard.db.adminUser.findFirst({ where: { id: after.betaOptInById }, select: { name: true } })
    : null
  return NextResponse.json({ optedIn: !!after?.betaOptInAt, optedInAt: after?.betaOptInAt?.toISOString() ?? null, optedInByName: by?.name ?? null })
}
