// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
// AdminUser isn't tenant-scoped; email uniqueness must be checked across all orgs. Scoped by organizationId explicitly.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { hashToken } from "@/lib/token-hash"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { validationError } from "@/lib/api-error"

const postSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().min(1).max(100),
})

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const admins = await db.adminUser.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      setupTokenExpiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(
    admins.map((a) => ({
      ...a,
      pending: !a.isActive && a.setupTokenExpiresAt != null,
    })),
  )
}

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { email, name } = parsed.data

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 })

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

  const setupToken = generateToken()
  const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const dummyHash = await bcrypt.hash(randomBytes(16).toString("hex"), 10)

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const inviteUrl = `${appUrl}/admin/accept-invite?token=${setupToken}`

  // The admin account and its invitation email commit together (#352).
  const { admin, outboxIds } = await prisma.$transaction(async (tx) => {
    const admin = await tx.adminUser.create({
      data: {
        organizationId,
        email,
        name,
        passwordHash: dummyHash,
        role: "admin",
        isActive: false,
        setupTokenHash: hashToken(setupToken),
        setupTokenExpiresAt,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, setupTokenExpiresAt: true },
    })
    const outboxIds = await enqueueNotifications([{
      kind: "admin_invite",
      recipient: { email, name },
      data: { adminName: name, organizationName: org.name, inviteUrl },
    }], tx)
    return { admin, outboxIds }
  })

  await logOrgEvent({
    organizationId,
    actor: adminActor(guard.session),
    action: "adminuser.invited",
    entityType: "AdminUser",
    entityId: admin.id,
  })

  deliverAfterResponse(outboxIds)

  return NextResponse.json({ ...admin, pending: true, inviteUrl }, { status: 201 })
}
