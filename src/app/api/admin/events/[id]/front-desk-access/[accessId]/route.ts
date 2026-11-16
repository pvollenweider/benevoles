// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
// AdminUser.sessionVersion is not tenant-scoped: the account was read through the event's grant.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { adminActor, logEvent } from "@/lib/event-log"
import { isGrantLive } from "@/lib/front-desk-access"
import { orgTimeZone } from "@/lib/time-zone"

export const dynamic = "force-dynamic"

type RevokeDb = {
  adminEventAccess: {
    findFirst(args: unknown): Promise<{ id: string; adminUserId: string; revokedAt: Date | null } | null>
    findMany(args: unknown): Promise<{
      id: string; revokedAt: Date | null; expiresAt: Date | null
      event: { publicStatus: string; endDate: Date; organization: { timeZone: string | null } | null } | null
    }[]>
    update(args: unknown): Promise<unknown>
  }
}

/**
 * Revokes one front-desk access (#1142), owners only. The account stays (it may hold another
 * event's grant), and the grant stays with `revokedAt`: the next request is refused, the panel
 * keeps the row with « Révoqué ». When no other live grant remains, the account's
 * `sessionVersion` is incremented, so an already-open session is refused on its next request.
 *
 * The row lock on the account, the revocation, the count of its remaining live grants and the
 * version bump are one transaction: a failure leaves the grant unrevoked and a retry repairs
 * everything, instead of a committed revocation whose session invalidation was lost. The same
 * lock is taken when a grant is created or re-opened, so the two cannot interleave. Revoking a
 * grant that is already revoked answers the same and still runs the session check, which repairs
 * a grant revoked by an earlier, non-transactional version. No event is logged twice.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; accessId: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id: eventId, accessId } = await params

  const access = await (db as unknown as RevokeDb).adminEventAccess.findFirst({
    where: { id: accessId, eventId },
    select: { id: true, adminUserId: true, revokedAt: true },
  })
  if (!access) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const now = new Date()
  const outcome = await prisma.$transaction(async (tx) => {
    // Lock the account row first: a concurrent grant creation or re-opening takes the same lock,
    // so it cannot slip a new live grant in between this count and the version bump.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AdminUser" WHERE id = ${access.adminUserId} AND "organizationId" = ${guard.organizationId} FOR UPDATE`
    if (locked.length === 0) return null

    let revokedNow = false
    if (!access.revokedAt) {
      const { count } = await tx.adminEventAccess.updateMany({
        where: { id: access.id, eventId, revokedAt: null },
        data: { revokedAt: now },
      })
      revokedNow = count === 1
    }

    // Another event may still be open to this person: only the last live grant ends the sessions,
    // with the same liveness rule as isGrantLive (revoked, expired, archived or ended event).
    const others = await tx.adminEventAccess.findMany({
      where: { adminUserId: access.adminUserId, revokedAt: null },
      select: {
        id: true, revokedAt: true, expiresAt: true,
        event: { select: { publicStatus: true, endDate: true, organization: { select: { timeZone: true } } } },
      },
    })
    const stillLive = (others ?? []).some((row) => !!row.event && isGrantLive(
      row,
      { publicStatus: row.event.publicStatus, endDate: row.event.endDate, timeZone: orgTimeZone(row.event.organization) },
      now,
    ))
    if (!stillLive) {
      // Scoped to the caller's organisation besides the id: a grant row must never end another
      // organisation's session, even if a bad row pointed across tenants.
      await tx.adminUser.updateMany({ where: { id: access.adminUserId, organizationId: guard.organizationId }, data: { sessionVersion: { increment: 1 } } })
    }
    return { revokedNow }
  })
  if (!outcome) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Only a revocation performed by this request is a new event; the repair path logs nothing.
  if (outcome.revokedNow) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "frontdesk.access_revoked",
      entityType: "AdminEventAccess",
      entityId: access.id,
    })
  }
  return NextResponse.json(outcome.revokedNow ? { revoked: true } : { revoked: true, alreadyRevoked: true })
}
