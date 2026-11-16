// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
// AdminUser and AdminEventAccess are written across the account/grant boundary here: the event
// and the account were both checked against the caller's organisation first. AdminUser is not
// tenant-scoped (its email is unique across the platform).
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { adminActor, logEvent } from "@/lib/event-log"
import { enqueueNotifications, deliverAfterResponse } from "@/lib/notifications/outbox"
import { hashToken } from "@/lib/token-hash"
import { validationError } from "@/lib/api-error"
import { isUniqueViolation } from "@/lib/registration-capacity"
import { rateLimit } from "@/lib/rate-limit"
import { apexBaseUrl } from "@/lib/urls"
import { orgTimeZone } from "@/lib/time-zone"
import { formatShortDate } from "@/lib/utils"
import { ADMIN_INVITE_PENDING_ERROR, canInviteAdmins } from "@/lib/org-approval"
import { findAdminEmailHolder } from "@/lib/admin-invitation-server"
import { FRONT_DESK_ROLE } from "@/lib/permissions"
import {
  FRONT_DESK_ADDRESS_UNAVAILABLE,
  FRONT_DESK_INVITES_PER_DAY,
  frontDeskAccessEnd,
  listEventFrontDeskAccesses,
} from "@/lib/front-desk-access"

export const dynamic = "force-dynamic"

const INVITE_WINDOW_MS = 24 * 60 * 60 * 1000
const SETUP_TOKEN_MS = 7 * 24 * 60 * 60 * 1000

const postSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
})

/** The same answer whether the invitation was created, the grant re-opened, or nothing changed. */
const ACCEPTED = () => NextResponse.json({ accepted: true }, { status: 202 })

const generateToken = () => randomBytes(32).toString("hex")

/** « le 14 juin 2026 » or « du 12 au 14 juin 2026 », in the event's stored calendar days. */
function eventDatesLabel(startDate: Date, endDate: Date): string {
  return formatShortDate(startDate) === formatShortDate(endDate)
    ? `le ${formatShortDate(startDate)}`
    : `du ${formatShortDate(startDate)} au ${formatShortDate(endDate)}`
}

type InviteDb = {
  event: {
    findFirst(args: unknown): Promise<{
      id: string; title: string; startDate: Date; endDate: Date
      organization: { name: string; timeZone: string | null } | null
    } | null>
  }
}

/**
 * The accesses of one event, for its owner panel (#1142): name, email, status and the event's
 * last day. Never the invitation token or its hash: the link exists only in the email.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const event = await guard.db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const accesses = await listEventFrontDeskAccesses(guard.db, id, new Date())
  return NextResponse.json({ accesses }, { headers: { "Cache-Control": "no-store" } })
}

/**
 * Gives one person a front-desk access to this event (#1142), owners only.
 *
 * A new address creates an inactive account with the role `front_desk` (like an invited admin:
 * password chosen from the emailed link, seven days), the grant, and the invitation email, in
 * one transaction. An address already held by a front-desk account of this organisation reuses
 * that account: the grant is created or re-opened, and the invitation is sent again only while
 * the account is not activated. Every other holder (an owner, an organiser, a super admin, an
 * account of another organisation) gets the same neutral answer, which never says whether the
 * address has an account.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id: eventId } = await params

  const parsed = postSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const { name, email } = parsed.data

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true, outboundEmailApprovedAt: true } })
  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })
  // A space awaiting validation invites nobody yet (#1045), like the team's own invitations.
  if (!canInviteAdmins(org)) return NextResponse.json({ error: ADMIN_INVITE_PENDING_ERROR, code: "org_pending" }, { status: 403 })

  // Counted before the address is looked up, whatever the outcome, so the budget also bounds
  // attempts on addresses that receive nothing.
  const rl = await rateLimit(`org:${organizationId}`, "front-desk-invite", FRONT_DESK_INVITES_PER_DAY, INVITE_WINDOW_MS)
  if (!rl.ok) return NextResponse.json({ error: "Trop d'invitations aujourd'hui. Réessayez demain." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })

  const event = await (db as unknown as InviteDb).event.findFirst({
    where: { id: eventId },
    select: { id: true, title: true, startDate: true, endDate: true, organization: { select: { name: true, timeZone: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const now = new Date()
  const expiresAt = frontDeskAccessEnd({ endDate: event.endDate, timeZone: orgTimeZone(event.organization) })
  const holder = await findAdminEmailHolder(prisma, email, now)
  // Only a front-desk account of this very organisation may receive (or extend) an access.
  if (holder && !(holder.organizationId === organizationId && holder.role === FRONT_DESK_ROLE)) {
    return NextResponse.json({ error: FRONT_DESK_ADDRESS_UNAVAILABLE }, { status: 409 })
  }

  const setupToken = holder && holder.isActive ? null : generateToken()
  const setupTokenExpiresAt = setupToken ? new Date(now.getTime() + SETUP_TOKEN_MS) : null
  const organizationName = event.organization?.name ?? org.name
  const inviteUrl = setupToken ? `${apexBaseUrl()}/admin/accept-invite?token=${setupToken}` : null
  const inviterName = guard.session.user?.name?.trim() || "Un propriétaire de l'organisation"

  const payload = (adminName: string) => ({
    kind: "front_desk_invite" as const,
    organizationId,
    recipient: { email, name: adminName },
    data: {
      adminName,
      organizationName,
      eventTitle: event.title,
      eventDates: eventDatesLabel(event.startDate, event.endDate),
      untilLabel: formatShortDate(event.endDate),
      inviterName,
      inviteUrl,
    },
  })

  let outcome: { adminId: string; grantId: string; reopened: boolean; invitationSent: boolean }
  try {
    if (!holder) {
      const dummyHash = await bcrypt.hash(randomBytes(16).toString("hex"), 10)
      const created = await prisma.$transaction(async (tx) => {
        const admin = await tx.adminUser.create({
          data: {
            organizationId,
            email,
            name,
            passwordHash: dummyHash,
            role: FRONT_DESK_ROLE,
            isActive: false,
            receiveProductUpdates: false,
            setupTokenHash: setupToken ? hashToken(setupToken) : null,
            setupTokenExpiresAt,
          },
          select: { id: true },
        })
        const grant = await tx.adminEventAccess.create({
          data: { adminUserId: admin.id, eventId, organizationId, createdById: guard.session.user?.id ?? null, expiresAt },
          select: { id: true },
        })
        const outboxIds = inviteUrl ? await enqueueNotifications([payload(name)], tx) : []
        return { adminId: admin.id, grantId: grant.id, invitationSent: !!inviteUrl, outboxIds }
      })
      deliverAfterResponse(created.outboxIds)
      outcome = { adminId: created.adminId, grantId: created.grantId, reopened: false, invitationSent: created.invitationSent }
    } else {
      const existing = await db.adminEventAccess.findFirst({ where: { adminUserId: holder.id, eventId }, select: { id: true, revokedAt: true, expiresAt: true } })
      const reopened = !!existing && (existing.revokedAt !== null || (existing.expiresAt !== null && existing.expiresAt.getTime() <= now.getTime()))
      const grant = existing
        ? await prisma.adminEventAccess.update({ where: { id: existing.id }, data: { revokedAt: null, expiresAt }, select: { id: true } })
        : await prisma.adminEventAccess.create({ data: { adminUserId: holder.id, eventId, organizationId, createdById: guard.session.user?.id ?? null, expiresAt }, select: { id: true } })
      let outboxIds: string[] = []
      if (setupToken) {
        await prisma.adminUser.update({
          where: { id: holder.id },
          data: { setupTokenHash: hashToken(setupToken), setupTokenExpiresAt, receiveProductUpdates: false },
        })
        outboxIds = await enqueueNotifications([payload(name)], prisma)
      }
      deliverAfterResponse(outboxIds)
      outcome = { adminId: holder.id, grantId: grant.id, reopened, invitationSent: !!setupToken }
    }
  } catch (e) {
    // The address was taken between the lookup and the write: the same neutral answer.
    if (isUniqueViolation(e)) return NextResponse.json({ error: FRONT_DESK_ADDRESS_UNAVAILABLE }, { status: 409 })
    throw e
  }

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: outcome.reopened ? "frontdesk.access_reopened" : "frontdesk.access_granted",
    entityType: "AdminEventAccess",
    entityId: outcome.grantId,
  })
  void outcome.adminId
  return ACCEPTED()
}
