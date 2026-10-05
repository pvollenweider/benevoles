// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { LOGO_ERRORS, LOGO_MAX_UPLOAD_BYTES, orgLogoOf } from "@/lib/org-logo"
import { processLogo } from "@/lib/org-logo-image"

/**
 * The organization's logo (#300), owners only (src/lib/permissions.ts).
 *
 * PUT: the image file itself as the request body (not a form), checked and re-encoded by
 * processLogo, then stored in place of the previous one in a single upsert. DELETE: removes it.
 * Both go through the org-scoped `db`, keyed by the session's organization: no id in the URL, so
 * no way to reach another organization's logo.
 */
export async function PUT(req: Request) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  // Refused before reading the body when the announced size is already too large.
  const announced = Number(req.headers.get("content-length") ?? "0")
  if (announced > LOGO_MAX_UPLOAD_BYTES) return NextResponse.json({ error: LOGO_ERRORS.tooLarge }, { status: 413 })

  const bytes = new Uint8Array(await req.arrayBuffer())
  const result = await processLogo(bytes)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === LOGO_ERRORS.tooLarge ? 413 : 400 })
  }

  const { data, mimeType, width, height, hash } = result.logo
  const fields = { data: new Uint8Array(data), mimeType, width, height, hash }
  const stored = await db.organizationLogo.upsert({
    where: { organizationId },
    create: { organizationId, ...fields },
    update: fields,
    select: { hash: true, width: true, height: true },
  })

  await logOrgEvent({
    organizationId,
    actor: adminActor(session),
    action: "organization.logo_updated",
    entityType: "Organization",
    entityId: organizationId,
  })

  return NextResponse.json({ logo: orgLogoOf(organizationId, stored) })
}

export async function DELETE() {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { count } = await db.organizationLogo.deleteMany({ where: { organizationId } })
  if (count > 0) {
    await logOrgEvent({
      organizationId,
      actor: adminActor(session),
      action: "organization.logo_removed",
      entityType: "Organization",
      entityId: organizationId,
    })
  }
  return NextResponse.json({ logo: null })
}
