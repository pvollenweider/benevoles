// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { inviteLink } from "@/lib/invite-link"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { generateToken } from "@/lib/utils"
import { hashToken } from "@/lib/token-hash"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  // Optional: which pending administrator, when the organisation has several.
  const body = await req.json().catch(() => ({})) as { adminId?: unknown }
  const adminId = typeof body?.adminId === "string" ? body.adminId : undefined

  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      name: true,
      admins: {
        where: { isActive: false, setupTokenHash: { not: null }, ...(adminId ? { id: adminId } : {}) },
        select: { id: true, email: true, name: true },
        take: 1,
      },
    },
  })

  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

  const admin = org.admins[0]
  if (!admin) return NextResponse.json({ error: "Aucun compte en attente d'activation." }, { status: 404 })

  // Only the hash is stored (#269), so a resend issues a fresh link (and a fresh 7-day window);
  // the previous link stops working.
  const setupToken = generateToken()
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { setupTokenHash: hashToken(setupToken), setupTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  })

  const inviteUrl = inviteLink(process.env.NEXT_PUBLIC_APP_URL, setupToken)

  const result = await sendNotification({
    kind: "admin_invite",
    recipient: { email: admin.email, name: admin.name },
    organizationId: id,
    data: { adminName: admin.name, organizationName: org.name, inviteUrl },
  })

  // The token is already rotated: whatever happened to the email, the caller needs the new link,
  // so the email outcome is part of a successful answer rather than an error status.
  return NextResponse.json({ ok: true, sent: result.ok, emailError: result.ok ? null : result.reason, inviteUrl, email: admin.email })
}
