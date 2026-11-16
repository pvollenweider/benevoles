// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { requireOrgSession } from "@/lib/auth-guard"
// The account and its grant are written together; both were checked against the caller's event
// and organisation first. AdminUser is not tenant-scoped.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { adminActor, logEvent } from "@/lib/event-log"
import { enqueueNotifications, deliverAfterResponse } from "@/lib/notifications/outbox"
import { hashToken } from "@/lib/token-hash"
import { apexBaseUrl } from "@/lib/urls"
import { NEVER_ACTIVATED_WHERE } from "@/lib/admin-invitation"
import { FRONT_DESK_INVITES_PER_DAY, formatFrontDeskDay, isGrantLive } from "@/lib/front-desk-access"
import { rateLimit } from "@/lib/rate-limit"
import { orgTimeZone } from "@/lib/time-zone"

export const dynamic = "force-dynamic"

const SETUP_TOKEN_MS = 7 * 24 * 60 * 60 * 1000
const INVITE_WINDOW_MS = 24 * 60 * 60 * 1000

type ResendDb = {
  adminEventAccess: {
    findFirst(args: unknown): Promise<{
      id: string
      revokedAt: Date | null
      expiresAt: Date | null
      adminUser: { id: string; name: string; email: string; isActive: boolean } | null
      event: {
        id: string; title: string; startDate: Date; endDate: Date; publicStatus: string
        organization: { name: string; timeZone: string | null } | null
      } | null
    } | null>
  }
}

/**
 * Sends the invitation again for an access whose account is not activated yet (#1142), owners
 * only. The person who lost the email gets a new seven-day link; the previous link stops working
 * (the account carries one setup token at a time). An activated account has nothing to resend:
 * it signs in with its password.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; accessId: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id: eventId, accessId } = await params

  // The same daily budget as an invitation (#1142): every request counts, so repeatedly rotating
  // a pending account's link cannot bypass the advertised 20 per day.
  const rl = await rateLimit(`org:${guard.organizationId}`, "front-desk-invite", FRONT_DESK_INVITES_PER_DAY, INVITE_WINDOW_MS)
  if (!rl.ok) return NextResponse.json({ error: "Trop d'invitations aujourd'hui. Réessayez demain." }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } })

  const access = await (db as unknown as ResendDb).adminEventAccess.findFirst({
    where: { id: accessId, eventId },
    select: {
      id: true, revokedAt: true, expiresAt: true,
      adminUser: { select: { id: true, name: true, email: true, isActive: true } },
      event: {
        select: {
          id: true, title: true, startDate: true, endDate: true, publicStatus: true,
          organization: { select: { name: true, timeZone: true } },
        },
      },
    },
  })
  if (!access?.adminUser || !access.event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const now = new Date()
  if (!isGrantLive(access, { publicStatus: access.event.publicStatus, endDate: access.event.endDate, timeZone: orgTimeZone(access.event.organization) }, now)) {
    return NextResponse.json({ error: "Cet accès n'est plus actif." }, { status: 409 })
  }
  if (access.adminUser.isActive) {
    return NextResponse.json({ error: "Ce compte est déjà activé." }, { status: 409 })
  }

  const setupToken = randomBytes(32).toString("hex")
  const setupTokenExpiresAt = new Date(now.getTime() + SETUP_TOKEN_MS)
  const inviteUrl = `${apexBaseUrl()}/admin/accept-invite?token=${setupToken}`
  const organizationName = access.event.organization?.name ?? ""
  const eventDates = formatFrontDeskDay(access.event.startDate) === formatFrontDeskDay(access.event.endDate)
    ? `le ${formatFrontDeskDay(access.event.startDate)}`
    : `du ${formatFrontDeskDay(access.event.startDate)} au ${formatFrontDeskDay(access.event.endDate)}`

  const outboxIds = await prisma.$transaction(async (tx) => {
    // Conditional on the never-activated state in the write itself (#1142): if the person
    // activated the account since the read, no row matches, no link is installed on the active
    // account, and nothing is queued or logged.
    const { count } = await tx.adminUser.updateMany({
      where: { id: access.adminUser!.id, organizationId: guard.organizationId, ...NEVER_ACTIVATED_WHERE },
      data: { setupTokenHash: hashToken(setupToken), setupTokenExpiresAt, receiveProductUpdates: false },
    })
    if (count === 0) return null
    return enqueueNotifications([{
      kind: "front_desk_invite",
      organizationId: guard.organizationId,
      recipient: { email: access.adminUser!.email, name: access.adminUser!.name },
      data: {
        adminName: access.adminUser!.name,
        organizationName,
        eventTitle: access.event!.title,
        eventDates,
        untilLabel: formatFrontDeskDay(access.event!.endDate),
        inviterName: guard.session.user?.name?.trim() || "Un propriétaire de l'organisation",
        inviteUrl,
      },
    }], tx)
  })
  if (outboxIds === null) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  deliverAfterResponse(outboxIds)

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "frontdesk.invitation_resent",
    entityType: "AdminEventAccess",
    entityId: access.id,
  })
  return NextResponse.json({ sent: true })
}
