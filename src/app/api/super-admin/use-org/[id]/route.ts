// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { canonicalRedirect, orgSwitchUrl, safeAdminNext } from "@/lib/admin-next"
import { configuredAppUrl } from "@/lib/urls"

/**
 * Picks the organization a super admin works in (sa-org-id cookie), then opens `next` when it is a
 * same-origin admin page (an email link to an event, see auth-guard.ts), the events list otherwise.
 *
 * A POST only (#1048), sent by the « Gérer » button of an organization or by the confirmation page
 * /super-admin/use-org/[id], and checked by the proxy like every admin API (src/lib/request-origin.ts):
 * the page of another organization's address can no longer switch it. The redirect is built from
 * the configured site address, not from forwarded headers.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } })
  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const cookieStore = await cookies()
  cookieStore.set("sa-org-id", id, {
    path: "/",
    httpOnly: true,
    // Lax, like the session cookie: an admin link opened from a webmail (a top-level cross-site
    // GET) must carry it.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })

  const next = safeAdminNext(await readNext(req))
  // 303: the browser follows the form's POST with a GET of the page.
  return NextResponse.redirect(canonicalRedirect(next, configuredAppUrl(), req.url), 303)
}

/**
 * The address used before #1048 (a link, or a page cached since): changes nothing any more, opens
 * the confirmation page instead.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const next = new URL(req.url).searchParams.get("next")
  return NextResponse.redirect(canonicalRedirect(orgSwitchUrl(id, next ?? ""), configuredAppUrl(), req.url), 303)
}

/** `next` from the confirmation page's form, or from the address. */
async function readNext(req: Request): Promise<string | null> {
  if ((req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    const value = (await req.formData()).get("next")
    if (typeof value === "string") return value
  }
  return new URL(req.url).searchParams.get("next")
}
