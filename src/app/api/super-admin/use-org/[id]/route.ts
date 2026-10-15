// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { safeAdminNext } from "@/lib/admin-next"

/**
 * Picks the organization a super admin works in (sa-org-id cookie), then opens `next` when it is a
 * same-origin admin page (an email link to an event, see auth-guard.ts), the events list otherwise.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // GET) must carry it. Every state-changing admin route is POST/PATCH/DELETE, which Lax does not
    // send cross-site.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000"
  const proto = req.headers.get("x-forwarded-proto") ?? "http"
  const next = safeAdminNext(new URL(req.url).searchParams.get("next"))
  return NextResponse.redirect(`${proto}://${host}${next}`)
}
