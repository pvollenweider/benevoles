// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
// Pre-login route: no org session yet, the invite token is the only credential.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { orgBaseUrl } from "@/lib/urls"
import { passwordSchema } from "@/lib/password"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { validationError } from "@/lib/api-error"
import { replyToOnActivation } from "@/lib/org-reply-to"
import { isOwnerRole } from "@/lib/permissions"
import { activationAllowed } from "@/lib/activation-budget"

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

const INVALID_ERROR = "Lien invalide ou déjà utilisé."
const EXPIRED_ERROR = "Ce lien a expiré. Contactez votre administrateur."

/** Looks up an invite token and returns its status, without consuming it. */
async function checkToken(token: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { setupTokenHash: hashToken(token) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      setupTokenExpiresAt: true,
      isActive: true,
      organizationId: true,
      organization: { select: { name: true, slug: true } },
    },
  })

  if (!admin) return { ok: false as const, status: 404, error: INVALID_ERROR }
  if (admin.setupTokenExpiresAt && admin.setupTokenExpiresAt < new Date()) {
    return { ok: false as const, status: 410, error: EXPIRED_ERROR }
  }
  return { ok: true as const, admin }
}

/** Read-only precheck so the page can show an error before the person fills the form. */
export async function GET(req: Request) {
  const rl = await rateLimit(getClientIp(req), "accept-invite-check", 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 })
  }

  const token = new URL(req.url).searchParams.get("token") ?? ""
  if (!token) return NextResponse.json({ valid: false, error: INVALID_ERROR }, { status: 404 })

  const result = await checkToken(token)
  if (!result.ok) return NextResponse.json({ valid: false, error: result.error }, { status: result.status })
  return NextResponse.json({ valid: true })
}

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { token, password } = parsed.data

  // Counted before the token lookup and bcrypt, so parallel requests can't all get through.
  if (!(await activationAllowed(getClientIp(req), token))) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 })
  }

  const result = await checkToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { admin } = result

  const passwordHash = await bcrypt.hash(password, 12)

  // Activation and welcome email commit together (#352).
  const organization = admin.organization
  const outboxIds = await prisma.$transaction(async (tx) => {
    // Consumes the link atomically: the update only matches while the account still carries this
    // token, unexpired. A concurrent request that consumed it first, a link replaced by a new
    // invitation or one expired during bcrypt match no row, and nothing else happens.
    const { count } = await tx.adminUser.updateMany({
      where: {
        id: admin.id,
        setupTokenHash: hashToken(token),
        OR: [{ setupTokenExpiresAt: null }, { setupTokenExpiresAt: { gt: new Date() } }],
      },
      data: {
        passwordHash,
        isActive: true,
        setupTokenHash: null,
        setupTokenExpiresAt: null,
      },
    })
    if (count === 0) return null
    if (!organization || !admin.organizationId) return []
    // An owner's now-confirmed address becomes the reply-to of an organization that has none
    // (#1077), only while it is still null: never over a value an owner set, nor after an owner
    // changed it in the email settings (a cleared value stays cleared). No address in the log.
    // Row lock on the organization: a settings save that starts meanwhile waits for this fill and
    // then writes the value the owner chose, so a clear saved at the same moment still wins.
    if (isOwnerRole(admin.role)) await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${admin.organizationId} FOR UPDATE`
    const editedInSettings = isOwnerRole(admin.role) && (await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "OrgLog"
      WHERE "organizationId" = ${admin.organizationId}
        AND "action" = 'organization.notifications_updated'
        AND ("changes" -> 'replyToEmail') IS NOT NULL
      LIMIT 1`).length > 0
    const replyTo = replyToOnActivation(admin.role, admin.email, editedInSettings)
    if (replyTo) {
      const { count } = await tx.organization.updateMany({
        where: { id: admin.organizationId, replyToEmail: null },
        data: { replyToEmail: replyTo },
      })
      if (count > 0) {
        await tx.orgLog.create({
          data: {
            organizationId: admin.organizationId,
            actorType: "admin",
            actorId: admin.id,
            action: "organization.reply_to_defaulted",
            entityType: "Organization",
            entityId: admin.organizationId,
          },
        })
      }
    }
    return enqueueNotifications([{
      kind: "admin_welcome",
      organizationId: admin.organizationId,
      dedupeKey: `admin_welcome:${admin.id}`,
      recipient: { email: admin.email, name: admin.name },
      data: {
        adminName: admin.name,
        organizationName: organization.name,
        adminUrl: `${orgBaseUrl(organization.slug)}/admin/events`,
      },
    }], tx)
  })
  if (outboxIds === null) {
    // Lost to another consumption, a replacement or the expiry: same answer as a fresh lookup.
    const now = await checkToken(token)
    return now.ok
      ? NextResponse.json({ error: INVALID_ERROR }, { status: 404 })
      : NextResponse.json({ error: now.error }, { status: now.status })
  }
  deliverAfterResponse(outboxIds)

  return NextResponse.json({ ok: true })
}
