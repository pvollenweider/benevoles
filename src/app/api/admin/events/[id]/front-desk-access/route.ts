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
import { reportError } from "@/lib/report-error"
import { apexBaseUrl } from "@/lib/urls"
import { orgTimeZone } from "@/lib/time-zone"
import { ADMIN_INVITE_PENDING_ERROR, canInviteAdmins } from "@/lib/org-approval"
import { findAdminEmailHolder } from "@/lib/admin-invitation-server"
import { isNeverActivated, NEVER_ACTIVATED_WHERE } from "@/lib/admin-invitation"
import { FRONT_DESK_ROLE, ORGANIZER_ROLE, OWNER_ROLE } from "@/lib/permissions"
import {
  FRONT_DESK_ACCOUNT_DEACTIVATED,
  FRONT_DESK_ALREADY_ADMIN,
  FRONT_DESK_INVITES_PER_DAY,
  formatFrontDeskDay,
  frontDeskAccessEnd,
  frontDeskInviteDedupeKey,
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

/**
 * The transaction did not apply (rolled back, or the account vanished under the lock): the owner
 * may retry, and a retry is safe. Never a success, which would leave nothing created or re-opened.
 */
const NOT_APPLIED = () => NextResponse.json(
  { error: "L'accès n'a pas pu être ajouté. Rien n'a été modifié. Réessayez.", notApplied: true },
  { status: 500 },
)

const generateToken = () => randomBytes(32).toString("hex")

/** « le 14 juin 2026 » or « du 12 au 14 juin 2026 », in the event's stored calendar days. */
function eventDatesLabel(startDate: Date, endDate: Date): string {
  return formatFrontDeskDay(startDate) === formatFrontDeskDay(endDate)
    ? `le ${formatFrontDeskDay(startDate)}`
    : `du ${formatFrontDeskDay(startDate)} au ${formatFrontDeskDay(endDate)}`
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
  const accesses = await listEventFrontDeskAccesses(guard.db, guard.organizationId, id, new Date())
  return NextResponse.json({ accesses }, { headers: { "Cache-Control": "no-store" } })
}

/**
 * Gives one person a front-desk access to this event (#1142), owners only.
 *
 * A new address creates an inactive account with the role `front_desk` (like an invited admin:
 * password chosen from the emailed link, seven days), the grant, and the invitation email, in
 * one transaction. An address already held by a front-desk account of this organisation reuses
 * that account: the grant is created or re-opened, and a new invitation link is installed and
 * sent only while the account is still a never-activated invitation. An activated account of this
 * organisation gets the grant without any email (it already has its password). A deactivated one
 * is refused openly, like an owner or an organiser of this organisation. Every account the route
 * may not touch (another organisation's account of any role, a super admin) gets exactly the same
 * 202 answer as a sent invitation, and nothing is written, sent or logged for that address: the
 * answer never says whether the address has an account.
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
  if (holder) {
    const sameOrganization = holder.organizationId === organizationId
    // An owner or an organiser of the caller's own team is already an administrator, and the owner
    // knows them: the refusal can be open, unlike the same holder in another organisation.
    if (sameOrganization && (holder.role === OWNER_ROLE || holder.role === ORGANIZER_ROLE)) {
      return NextResponse.json({ error: FRONT_DESK_ALREADY_ADMIN }, { status: 409 })
    }
    // Any other account (another organisation's, a super admin's) is not the caller's business:
    // the same answer as a sent invitation, and no write, email or log for that address.
    if (!(sameOrganization && holder.role === FRONT_DESK_ROLE)) {
      // Pay the same fixed bcrypt cost as a free address (#1142): otherwise response time tells
      // the owner whether the address is held elsewhere.
      await bcrypt.hash(randomBytes(16).toString("hex"), 10)
      return ACCEPTED()
    }
    // A front-desk account activated and later deactivated has no setup link left: it is not a
    // pending invitation, and re-inviting it silently would reset its password. The owner may know.
    if (!holder.isActive && !isNeverActivated(holder)) {
      return NextResponse.json({ error: FRONT_DESK_ACCOUNT_DEACTIVATED }, { status: 409 })
    }
  }

  // A new account always gets a link; so does a never-activated front-desk account when it is
  // invited again. An activated account already has its password and gets none.
  const setupToken = !holder || isNeverActivated(holder) ? generateToken() : null
  const setupTokenHash = setupToken ? hashToken(setupToken) : null
  // An activated account follows the no-link path above, but pays the same one-hash fixed cost
  // as a free address (#1142), so response time does not reveal that the address is taken.
  if (holder?.isActive) await bcrypt.hash(randomBytes(16).toString("hex"), 10)
  const setupTokenExpiresAt = setupToken ? new Date(now.getTime() + SETUP_TOKEN_MS) : null
  const organizationName = event.organization?.name ?? org.name
  const inviteUrl = setupToken ? `${apexBaseUrl()}/admin/accept-invite?token=${setupToken}` : null
  const inviterName = guard.session.user?.name?.trim() || "Un propriétaire de l'organisation"

  const payload = (adminName: string, adminId: string) => ({
    kind: "front_desk_invite" as const,
    organizationId,
    // The purge deletes an account's queued invitations by this key (#1142). The nonce is the
    // setup-token hash, so a resend is a new row instead of being skipped as already queued.
    dedupeKey: frontDeskInviteDedupeKey(organizationId, adminId, setupTokenHash ?? ""),
    recipient: { email, name: adminName },
    data: {
      adminName,
      organizationName,
      eventTitle: event.title,
      eventDates: eventDatesLabel(event.startDate, event.endDate),
      untilLabel: formatFrontDeskDay(event.endDate),
      inviterName,
      inviteUrl,
    },
  })

  let outcome: { adminId: string; grantId: string; reopened: boolean; invitationSent: boolean; outboxIds: string[] }
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
            setupTokenHash,
            setupTokenExpiresAt,
          },
          select: { id: true },
        })
        const grant = await tx.adminEventAccess.create({
          data: { adminUserId: admin.id, eventId, organizationId, createdById: guard.session.user?.id ?? null, expiresAt },
          select: { id: true },
        })
        const outboxIds = inviteUrl ? await enqueueNotifications([payload(name, admin.id)], tx) : []
        return { adminId: admin.id, grantId: grant.id, invitationSent: !!inviteUrl, outboxIds }
      })
      outcome = { ...created, reopened: false }
    } else {
      // The grant, the link replacement and the email commit together, on the account's row lock:
      // a concurrent revocation (which takes the same lock) and this write cannot interleave.
      const existingOutcome = await prisma.$transaction(async (tx) => {
        // Lock order: the account row first, then the grant, the same order the revocation uses.
        // An organisation deletion deletes grants through the cascade before the accounts; a
        // concurrent run can deadlock one transaction. PostgreSQL aborts one of them, and the
        // catch below reports that as a retryable failure, never as success.
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "AdminUser" WHERE id = ${holder.id} AND "organizationId" = ${organizationId} FOR UPDATE`
        if (locked.length === 0) return null
        const existing = await tx.adminEventAccess.findFirst({
          where: { adminUserId: holder.id, eventId },
          select: { id: true, revokedAt: true, expiresAt: true },
        })
        const reopened = !!existing && (existing.revokedAt !== null || (existing.expiresAt !== null && existing.expiresAt.getTime() <= now.getTime()))
        const grant = existing
          ? await tx.adminEventAccess.update({ where: { id: existing.id }, data: { revokedAt: null, expiresAt }, select: { id: true } })
          : await tx.adminEventAccess.create({ data: { adminUserId: holder.id, eventId, organizationId, createdById: guard.session.user?.id ?? null, expiresAt }, select: { id: true } })
        let outboxIds: string[] = []
        let invitationSent = false
        if (setupToken) {
          // Conditional on the never-activated state in the write itself: an activation that
          // happened since the read matches no row, so no setup link lands on an active account.
          const { count } = await tx.adminUser.updateMany({
            where: { id: holder.id, organizationId, ...NEVER_ACTIVATED_WHERE },
            data: { setupTokenHash, setupTokenExpiresAt, receiveProductUpdates: false },
          })
          if (count === 1) {
            invitationSent = true
            outboxIds = await enqueueNotifications([payload(name, holder.id)], tx)
          }
        }
        return { adminId: holder.id, grantId: grant.id, reopened, invitationSent, outboxIds }
      })
      // The account this owner already knew (same organisation, read above) disappeared under the
      // lock: the purge won the race. Nothing was created, so never answer the neutral 202 that
      // means « accepted »; a second attempt simply invites the person afresh. The hidden 202 path
      // (an address held elsewhere) is before this transaction and unchanged.
      if (!existingOutcome) return NOT_APPLIED()
      outcome = existingOutcome
    }
  } catch (e) {
    // The address was taken between the lookup and the write: the same neutral answer as a sent
    // invitation, never a hint that the address now has an account.
    if (isUniqueViolation(e)) return ACCEPTED()
    // The transaction rolled back. Never report success: the owner can retry, and a retry is safe
    // (the grant and the link are written together).
    reportError("frontdesk.access_grant")(e)
    return NOT_APPLIED()
  }
  deliverAfterResponse(outcome.outboxIds)

  // A token write that matched no row means the account was activated under the lock: this is the
  // active-account case. No email went out (`invitationSent` is false), and the entry is the one of
  // an access added to an existing account, exactly as a request made a moment later would write
  // it. No invitation-specific entry is emitted.
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
