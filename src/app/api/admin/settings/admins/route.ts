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
import { ORG_ROLES, ORGANIZER_ROLE } from "@/lib/permissions"
import { apexBaseUrl } from "@/lib/urls"
import { ADMIN_INVITE_PENDING_ERROR, canInviteAdmins } from "@/lib/org-approval"
import { ADMIN_INVITE_SAME_ORG_ERROR, ADMIN_INVITE_UNAVAILABLE_ERROR, adminInviteCheck } from "@/lib/admin-invitation"
import { findAdminEmailHolder, releaseExpiredInvitation } from "@/lib/admin-invitation-server"
import { isUniqueViolation } from "@/lib/registration-capacity"

const postSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().min(1).max(100),
  /** Level of the new admin (#469); organiser unless an owner is chosen explicitly. */
  role: z.enum(ORG_ROLES).default(ORGANIZER_ROLE),
})

/** The address was taken, or its expired invitation renewed, between the check and the write. */
class AddressTakenMeanwhile extends Error {}

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
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { email, name, role } = parsed.data

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true, outboundEmailApprovedAt: true } })
  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })
  // A space awaiting validation invites nobody yet (#1045): before any account or email exists.
  if (!canInviteAdmins(org)) return NextResponse.json({ error: ADMIN_INVITE_PENDING_ERROR, code: "org_pending" }, { status: 403 })

  // An expired, never-activated invitation no longer holds the address (#1053); an active account
  // or a valid invitation does. Another organisation's holder gets an answer that names nothing.
  const now = new Date()
  const holder = await findAdminEmailHolder(prisma, email)
  const check = adminInviteCheck(holder, organizationId, now)
  if (check === "same_org") return NextResponse.json({ error: ADMIN_INVITE_SAME_ORG_ERROR }, { status: 409 })
  if (check === "unavailable") return NextResponse.json({ error: ADMIN_INVITE_UNAVAILABLE_ERROR }, { status: 409 })

  const setupToken = generateToken()
  const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const dummyHash = await bcrypt.hash(randomBytes(16).toString("hex"), 10)

  // The setup link goes by email only, never back to the owner (#1045): activating the account
  // must take access to that mailbox.
  const appUrl = apexBaseUrl()
  const inviteUrl = `${appUrl}/admin/accept-invite?token=${setupToken}`

  // The admin account and its invitation email commit together (#352), with the removal of the
  // expired invitation it replaces, if any (#1053).
  let created
  try {
    created = await prisma.$transaction(async (tx) => {
      if (check === "replace" && holder && !(await releaseExpiredInvitation(tx, holder, now))) throw new AddressTakenMeanwhile()
      const admin = await tx.adminUser.create({
        data: {
          organizationId,
          email,
          name,
          passwordHash: dummyHash,
          role,
          isActive: false,
          setupTokenHash: hashToken(setupToken),
          setupTokenExpiresAt,
        },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, setupTokenExpiresAt: true },
      })
      const outboxIds = await enqueueNotifications([{
        organizationId,
        kind: "admin_invite",
        recipient: { email, name },
        data: { adminName: name, organizationName: org.name, inviteUrl },
      }], tx)
      return { admin, outboxIds }
    })
  } catch (e) {
    if (e instanceof AddressTakenMeanwhile || isUniqueViolation(e)) {
      return NextResponse.json({ error: ADMIN_INVITE_UNAVAILABLE_ERROR }, { status: 409 })
    }
    throw e
  }
  const { admin, outboxIds } = created

  await logOrgEvent({
    organizationId,
    actor: adminActor(guard.session),
    action: "adminuser.invited",
    entityType: "AdminUser",
    entityId: admin.id,
    changes: { role: { from: null, to: role } },
  })

  deliverAfterResponse(outboxIds)

  return NextResponse.json({ ...admin, pending: true }, { status: 201 })
}
