// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Front-desk access limited to one event (#1142), server only: whether an account holds a live
 * grant (AdminEventAccess) on an event. Read on every request by the one guard that accepts the
 * role (requireFrontDeskOrOrganizer, src/lib/auth-guard.ts): a revocation, an expiry or an
 * archived event refuses the next request, whatever session is still open.
 */
import { prisma } from "./prisma"
import { FRONT_DESK_ROLE } from "./permissions"

export type GrantFacts = { revokedAt: Date | null; expiresAt: Date | null }
export type GrantEventFacts = { publicStatus: string }

/**
 * The date and status rules of a grant, pure: revoked, never again; past `expiresAt`, dead (the
 * instant itself included); archived event, no access. No implicit expiry from the event's own
 * dates in this change: a grant without `expiresAt` stays live after the event has ended, until
 * it is revoked or the event archived. The expiry at the event's end comes with the change that
 * creates grants, which sets `expiresAt`.
 */
export function isGrantLive(grant: GrantFacts | null | undefined, event: GrantEventFacts | null | undefined, now: Date): boolean {
  if (!grant || !event) return false
  if (grant.revokedAt) return false
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false
  if (event.publicStatus === "archived") return false
  return true
}

export type FrontDeskGrant = {
  id: string
  adminUserId: string
  eventId: string
  organizationId: string
  expiresAt: Date | null
}

type GrantReader = {
  adminEventAccess: {
    findFirst(args: {
      where: {
        adminUserId: string; eventId: string; organizationId: string
        adminUser: { organizationId: string; isActive: true; role: string }
        event: { organizationId: string }
      }
      select: {
        id: true; adminUserId: true; eventId: true; organizationId: true; expiresAt: true; revokedAt: true
        adminUser: { select: { organizationId: true; isActive: true; role: true } }
        event: { select: { id: true; organizationId: true; publicStatus: true } }
      }
    }): Promise<{
      id: string; adminUserId: string; eventId: string; organizationId: string; expiresAt: Date | null; revokedAt: Date | null
      adminUser: { organizationId: string | null; isActive: boolean; role: string } | null
      event: { id: string; organizationId: string; publicStatus: string } | null
    } | null>
  }
}

/**
 * The grant of `adminUserId` on `eventId`, only if all of this holds now: the row exists for this
 * account and this event, in this organisation; the account is still an active front-desk account
 * of this organisation; the event belongs to this organisation and is not archived; the grant is
 * neither revoked nor expired. Null otherwise, without saying which rule failed.
 *
 * The query filters on every one of those facts, and each is checked again on the row read: the
 * answer does not rest on the `where` alone.
 */
export async function loadFrontDeskGrant(
  input: { adminUserId: string; organizationId: string; eventId: string; now: Date },
  db: GrantReader = prisma,
): Promise<FrontDeskGrant | null> {
  const { adminUserId, organizationId, eventId, now } = input
  if (!adminUserId || !organizationId || !eventId) return null
  const row = await db.adminEventAccess.findFirst({
    where: {
      adminUserId, eventId, organizationId,
      adminUser: { organizationId, isActive: true, role: FRONT_DESK_ROLE },
      event: { organizationId },
    },
    select: {
      id: true, adminUserId: true, eventId: true, organizationId: true, expiresAt: true, revokedAt: true,
      adminUser: { select: { organizationId: true, isActive: true, role: true } },
      event: { select: { id: true, organizationId: true, publicStatus: true } },
    },
  })
  if (!row || !row.adminUser || !row.event) return null
  if (row.adminUserId !== adminUserId || row.eventId !== eventId || row.organizationId !== organizationId) return null
  if (row.adminUser.organizationId !== organizationId || !row.adminUser.isActive || row.adminUser.role !== FRONT_DESK_ROLE) return null
  if (row.event.id !== eventId || row.event.organizationId !== organizationId) return null
  if (!isGrantLive(row, row.event, now)) return null
  return { id: row.id, adminUserId: row.adminUserId, eventId: row.eventId, organizationId: row.organizationId, expiresAt: row.expiresAt }
}
