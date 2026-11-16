// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { auth } from "@/auth"
import { canPublish } from "@/lib/org-approval"
import { prisma } from "@/lib/prisma"
import { etagMatches, logoCacheControl, logoEtag } from "@/lib/org-logo"
import { isOrgAdminRole } from "@/lib/permissions"

/**
 * GET /api/public/organizations/[id]/logo?v=<version> (#300): the organization's logo, from the
 * app's own origin (public pages, printed sheets, emails). Only the logo of that organization,
 * and only while it is active: a deactivated or deleted organization, or one without a logo, is a
 * 404, never another organization's image. The bytes are the server's own re-encoding (PNG or
 * JPEG), sent with nosniff, versioned by `v` and revalidated by ETag.
 *
 * A space awaiting validation (#810) has no public page: its logo is served only to its own
 * signed-in administrators and the super admin (the settings preview), never cached by a shared
 * cache, and a 404 for anyone else, so a pending space cannot host an image on benevol.app.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const logo = await prisma.organizationLogo.findFirst({
    where: { organizationId: id, organization: { active: true } },
    select: { data: true, mimeType: true, hash: true, organization: { select: { publicationApprovedAt: true } } },
  })
  const notFound = () => new Response("Logo introuvable", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  })
  if (!logo) return notFound()

  const isPublic = canPublish(logo.organization)
  if (!isPublic) {
    const session = await auth()
    // The organisation's own administrators (and the super admin) see it before publication:
    // not a front-desk account (#1142), nor any role that is no admin level.
    const allowed = session?.user?.role === "super_admin" || (isOrgAdminRole(session?.user?.role) && session?.user?.organizationId === id)
    if (!allowed) return notFound()
  }

  const headers = {
    "Cache-Control": isPublic ? logoCacheControl(new URL(req.url).searchParams.get("v"), logo.hash) : "private, no-store",
    ETag: logoEtag(logo.hash),
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
  }
  if (etagMatches(req.headers.get("if-none-match"), logo.hash)) return new Response(null, { status: 304, headers })

  return new Response(new Uint8Array(logo.data), {
    status: 200,
    headers: { ...headers, "Content-Type": logo.mimeType, "Content-Length": String(logo.data.length) },
  })
}
