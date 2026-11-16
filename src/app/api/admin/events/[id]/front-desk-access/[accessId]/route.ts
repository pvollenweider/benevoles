// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
// The account row lock reads AdminUser, which the org-scoped client does not scope by a plain
// `where` for `$queryRaw`; the lock query itself carries the caller's `organizationId`.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { adminActor, logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"

export const dynamic = "force-dynamic"

type RevokeDb = {
  adminEventAccess: {
    findFirst(args: unknown): Promise<{ id: string; adminUserId: string } | null>
  }
}

/**
 * Revokes one front-desk access (#1142), owners only. The account stays (it may hold another
 * event's grant), and the grant stays with `revokedAt`: the guard reloads the grant on every
 * request, so the next request is refused while the session itself stays valid. The person then
 * sees the end-of-access message on the open board, and « Mes accès » reads that no access is in
 * progress.
 *
 * The account row lock and the conditional revocation are one transaction: a POST re-opening the
 * grant takes the same lock, so a revocation and a re-opening cannot interleave. Under the lock,
 * the conditional write is the re-read of the grant: count 1 means this request revoked it, count
 * 0 means it was already revoked before this request. A failure rolls everything back, and
 * revoking an already revoked grant answers the same. No event is logged twice.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; accessId: string }> }) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id: eventId, accessId } = await params

  const access = await (db as unknown as RevokeDb).adminEventAccess.findFirst({
    where: { id: accessId, eventId },
    select: { id: true, adminUserId: true },
  })
  if (!access) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const now = new Date()
  let outcome: { revokedNow: boolean } | null
  try {
    outcome = await prisma.$transaction(async (tx) => {
      // Lock order: the account row is locked first, then the grant is written, like the creation
      // and re-opening path. An organisation deletion deletes grants through the cascade before
      // the accounts; a concurrent run can therefore deadlock one transaction. PostgreSQL aborts
      // one of them, and the catch below reports that as a retryable failure, never as success.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AdminUser" WHERE id = ${access.adminUserId} AND "organizationId" = ${guard.organizationId} FOR UPDATE`
      if (locked.length === 0) return null

      // The pre-lock read may be stale: a POST can have re-opened the grant in between. The
      // conditional write decides on the value read under the lock: count 1 means this request
      // revoked it, count 0 means it was already revoked before this request.
      const { count } = await tx.adminEventAccess.updateMany({
        where: { id: access.id, eventId, revokedAt: null },
        data: { revokedAt: now },
      })
      return { revokedNow: count === 1 }
    })
  } catch (e) {
    // The transaction rolled back. Never answer success: the owner can retry, and a retry repairs
    // the whole revocation.
    reportError("frontdesk.access_revoke")(e)
    return NextResponse.json({ error: "La révocation n'a pas pu être faite. Rien n'a été modifié. Réessayez.", notApplied: true }, { status: 500 })
  }
  if (!outcome) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Only a revocation performed by this request is a new event; the idempotent path logs nothing.
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
