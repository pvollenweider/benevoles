// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PUBLIC_ORG_WHERE } from "@/lib/org-approval"
import { prisma } from "@/lib/prisma"
import { etagMatches, logoCacheControl, logoEtag } from "@/lib/org-logo"

/**
 * GET /api/public/organizations/[id]/logo?v=<version> (#300): the organization's logo, from the
 * app's own origin (public pages, printed sheets, emails). Only the logo of that organization,
 * and only while it is active: a deactivated or deleted organization, or one without a logo, is a
 * 404, never another organization's image. The bytes are the server's own re-encoding (PNG or
 * JPEG), sent with nosniff, versioned by `v` and revalidated by ETag.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const logo = await prisma.organizationLogo.findFirst({
    where: { organizationId: id, organization: PUBLIC_ORG_WHERE },
    select: { data: true, mimeType: true, hash: true },
  })
  if (!logo) {
    return new Response("Logo introuvable", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    })
  }

  const headers = {
    "Cache-Control": logoCacheControl(new URL(req.url).searchParams.get("v"), logo.hash),
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
