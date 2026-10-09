// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { canPublish, PUBLICATION_REQUESTED_MESSAGE } from "@/lib/org-approval"
import { rateLimit } from "@/lib/rate-limit"
import { reportError } from "@/lib/report-error"
import { plainLabel } from "@/lib/signup"

/**
 * « Demander la publication » (#810): in a space awaiting validation, the publish button asks the
 * operator instead. One alert per space and per day at most (ntfy + email); the answer is the
 * same either way. Nothing is published: the operator validates the space from its page.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrgSession()
  if (ctx instanceof NextResponse) return ctx
  const { id } = await params

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: { title: true, organization: { select: { name: true, slug: true, publicationApprovedAt: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (canPublish(event.organization)) return NextResponse.json({ error: "Votre espace est validé : vous pouvez publier." }, { status: 409 })

  const allowed = await rateLimit(ctx.organizationId, "publication-request", 1, 24 * 60 * 60 * 1000)
  if (allowed.ok) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "")
    void import("@/lib/operator-alerts")
      .then((m) => m.notifyOperator({
        key: `publication-request:${ctx.organizationId}:${new Date().toISOString().slice(0, 10)}`,
        title: "Demande de publication",
        message: `${plainLabel(event.organization.name)} demande à publier « ${plainLabel(event.title)} » : son espace attend une validation.`,
        priority: 4,
        url: base ? `${base}/super-admin/organizations/${event.organization.slug}` : undefined,
      }))
      .catch(reportError("publication_request.alert"))
  }
  return NextResponse.json({ ok: true, message: PUBLICATION_REQUESTED_MESSAGE })
}
