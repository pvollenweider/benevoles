// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Bulk invalidation of volunteer-facing links (#542): after a leak, rotating
 * `TOKEN_ENCRYPTION_KEY` (src/lib/token-vault.ts) does not revoke a single link, because lookups
 * only need the row's hash to still match — the key only controls whether the clear token can be
 * re-sent. The only way to make a leaked link stop resolving is to give its row a brand new
 * token, which is what this module does, for `Registration.editToken`, `SectorLeader.token` and
 * `MemberInvite.token`.
 *
 * Scope is either every row of an organization, every row of one event, or an explicit list of
 * row ids (the last form is for #600: a member merge moves a registration/invite to the
 * surviving volunteer, whose wrong address may have delivered the old link to someone else, so
 * only those specific rows need rotating, not the whole event).
 *
 * Every row in scope is rotated, regardless of status: a cancelled registration's link is not
 * re-sent to anyone, but its row still exists and its old link would otherwise work forever —
 * nothing else ever rotates it. After a leak, "the old link stops working" has to be true for
 * every row, live or not; only the resend step cares whether a row is live.
 *
 * Called from scripts/regenerate-links.ts (operator CLI). Not wired to a super-admin UI action:
 * issue #542 asks for "a script or a super-admin action", and the script keeps the surface area
 * (and the blast radius of a mistake) small.
 */

import { generateToken } from "./utils"
import { registrationToken, linkToken } from "./token-vault"
import { sendNotification } from "./notifications"
import { sendMemberInvite } from "./notification-helpers"
import { LIVE_STATUSES } from "./registration-capacity"

const LIVE = new Set<string>(LIVE_STATUSES)

export type LinkScope =
  | { organizationId: string }
  | { eventId: string }
  | { registrationIds?: string[]; leaderIds?: string[]; inviteIds?: string[] }

export type RegenerateLinksOptions = {
  /** Also email every affected volunteer/leader/member their new link (#542, point 2). */
  resend?: boolean
}

export type ResendCounts = { sent: number; failed: number; skipped: number }

export type RegenerateLinksResult = {
  counts: { registrations: number; leaders: number; invites: number }
  resend?: { registrations: ResendCounts; leaders: ResendCounts; invites: ResendCounts }
}

type RegistrationRow = {
  id: string
  volunteerId: string
  eventId: string
  status: string
  volunteer: { firstName: string; lastName: string; email: string | null }
  event: { title: string; organizationId: string; organization: { slug: string } }
}

type LeaderRow = {
  id: string
  roleName: string
  name: string
  email: string
  event: { title: string; organizationId: string; organization: { slug: string } }
}

type InviteRow = {
  id: string
  volunteerId: string
  volunteer: { firstName: string; email: string | null; active: boolean }
  event: {
    title: string
    slug: string
    startDate: Date
    location: string | null
    organizationId: string
    organization: { name: string; slug: string }
  }
}

const registrationSelect = {
  id: true,
  volunteerId: true,
  eventId: true,
  status: true,
  volunteer: { select: { firstName: true, lastName: true, email: true } },
  event: { select: { title: true, organizationId: true, organization: { select: { slug: true } } } },
} as const

const leaderSelect = {
  id: true,
  roleName: true,
  name: true,
  email: true,
  event: { select: { title: true, organizationId: true, organization: { select: { slug: true } } } },
} as const

const inviteSelect = {
  id: true,
  volunteerId: true,
  volunteer: { select: { firstName: true, email: true, active: true } },
  event: {
    select: {
      title: true,
      slug: true,
      startDate: true,
      location: true,
      organizationId: true,
      organization: { select: { name: true, slug: true } },
    },
  },
} as const

/**
 * The slice of the Prisma client this module needs, kept narrow and duck-typed (rather than the
 * generated `PrismaClient` type) so tests can pass a plain mock — `as unknown as LinkRegenerationDb`
 * — like the rest of the codebase does for `OrgScopedPrisma`. The real `prisma` singleton
 * (src/lib/prisma.ts) satisfies this structurally.
 */
export interface LinkRegenerationDb {
  registration: {
    findMany(args: { where: Record<string, unknown>; select: typeof registrationSelect }): Promise<RegistrationRow[]>
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>
  }
  sectorLeader: {
    findMany(args: { where: Record<string, unknown>; select: typeof leaderSelect }): Promise<LeaderRow[]>
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>
  }
  memberInvite: {
    findMany(args: { where: Record<string, unknown>; select: typeof inviteSelect }): Promise<InviteRow[]>
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>
  }
  $transaction<T>(fn: (tx: LinkRegenerationDb) => Promise<T>, options?: { maxWait?: number; timeout?: number }): Promise<T>
}

function registrationWhere(scope: LinkScope): Record<string, unknown> | null {
  if ("organizationId" in scope) return { event: { organizationId: scope.organizationId } }
  if ("eventId" in scope) return { eventId: scope.eventId }
  return scope.registrationIds?.length ? { id: { in: scope.registrationIds } } : null
}

function leaderWhere(scope: LinkScope): Record<string, unknown> | null {
  if ("organizationId" in scope) return { event: { organizationId: scope.organizationId } }
  if ("eventId" in scope) return { eventId: scope.eventId }
  return scope.leaderIds?.length ? { id: { in: scope.leaderIds } } : null
}

function inviteWhere(scope: LinkScope): Record<string, unknown> | null {
  if ("organizationId" in scope) return { event: { organizationId: scope.organizationId } }
  if ("eventId" in scope) return { eventId: scope.eventId }
  return scope.inviteIds?.length ? { id: { in: scope.inviteIds } } : null
}

/** Rows a scope would touch, without changing anything — used for the CLI's dry run. */
export async function countLinksInScope(db: LinkRegenerationDb, scope: LinkScope): Promise<RegenerateLinksResult["counts"]> {
  const [registrations, leaders, invites] = await Promise.all([
    registrationWhere(scope) ? db.registration.findMany({ where: registrationWhere(scope)!, select: registrationSelect }) : [],
    leaderWhere(scope) ? db.sectorLeader.findMany({ where: leaderWhere(scope)!, select: leaderSelect }) : [],
    inviteWhere(scope) ? db.memberInvite.findMany({ where: inviteWhere(scope)!, select: inviteSelect }) : [],
  ])
  return { registrations: registrations.length, leaders: leaders.length, invites: invites.length }
}

/**
 * Rotates every targeted row's token in one transaction, then (optionally) resends the new
 * links. Returns how many rows of each type were rotated, and — with `options.resend` — how
 * many emails went out.
 */
export async function regenerateLinks(
  db: LinkRegenerationDb,
  scope: LinkScope,
  options: RegenerateLinksOptions = {},
): Promise<RegenerateLinksResult> {
  const regWhere = registrationWhere(scope)
  const leadWhere = leaderWhere(scope)
  const invWhere = inviteWhere(scope)

  const [registrations, leaders, invites] = await Promise.all([
    regWhere ? db.registration.findMany({ where: regWhere, select: registrationSelect }) : Promise.resolve([]),
    leadWhere ? db.sectorLeader.findMany({ where: leadWhere, select: leaderSelect }) : Promise.resolve([]),
    invWhere ? db.memberInvite.findMany({ where: invWhere, select: inviteSelect }) : Promise.resolve([]),
  ])

  // One fresh token per row, generated up front: the new clear token is needed for the resend
  // step below, and sealing (registrationToken.data / linkToken.data) can't be reversed from the
  // stored columns without the encryption key, which the resend step shouldn't have to assume.
  const newTokenById = new Map<string, string>()
  for (const row of [...registrations, ...leaders, ...invites]) newTokenById.set(row.id, generateToken())

  await db.$transaction(async (tx) => {
    await Promise.all([
      ...registrations.map((r) => tx.registration.update({ where: { id: r.id }, data: registrationToken.data(newTokenById.get(r.id)!) })),
      ...leaders.map((l) => tx.sectorLeader.update({ where: { id: l.id }, data: linkToken.data(newTokenById.get(l.id)!) })),
      ...invites.map((i) => tx.memberInvite.update({ where: { id: i.id }, data: linkToken.data(newTokenById.get(i.id)!) })),
    ])
  }, { maxWait: 10_000, timeout: 120_000 }) // a whole organization can hold thousands of rows: Prisma's 5 s default is too short

  const result: RegenerateLinksResult = {
    counts: { registrations: registrations.length, leaders: leaders.length, invites: invites.length },
  }

  if (options.resend) {
    result.resend = {
      registrations: await resendRegistrationLinks(registrations, newTokenById),
      leaders: await resendLeaderLinks(leaders, newTokenById),
      invites: await resendInviteLinks(invites, newTokenById),
    }
    // Best-effort bookkeeping (same field the existing resend routes update); failure here must
    // not undo the rotation or be reported as a resend failure.
    if (result.resend.registrations.sent > 0) {
      await db.registration.updateMany({
        where: { ...(regWhere ?? {}), status: { in: [...LIVE_STATUSES] } },
        data: { linkEmailedAt: new Date() },
      }).catch(() => {})
    }
  }

  return result
}

/**
 * One email per volunteer *per event* (not per row): several of a volunteer's registrations for
 * the same event share one personal page, so resending once is enough — but a scope spanning
 * several events (an organization) must not merge different events under the same volunteer.
 * Only a row that is still live is a usable "here's your link" target; a volunteer whose only
 * rows in scope are cancelled has nothing to send (counted as skipped, not failed).
 */
async function resendRegistrationLinks(rows: RegistrationRow[], newTokenById: Map<string, string>): Promise<ResendCounts> {
  const groups = new Map<string, RegistrationRow>()
  for (const r of rows) {
    const key = `${r.volunteerId}:${r.eventId}`
    const existing = groups.get(key)
    if (!existing || (!LIVE.has(existing.status) && LIVE.has(r.status))) groups.set(key, r)
  }

  let sent = 0, failed = 0, skipped = 0
  for (const r of groups.values()) {
    if (!r.volunteer.email || !LIVE.has(r.status)) { skipped++; continue }
    const name = `${r.volunteer.firstName} ${r.volunteer.lastName}`
    try {
      const result = await sendNotification({
        kind: "registration_link_resend",
        recipient: { email: r.volunteer.email, name },
        volunteerId: r.volunteerId,
        organizationId: r.event.organizationId,
        data: { volunteerName: name, eventTitle: r.event.title, orgSlug: r.event.organization.slug, editToken: newTokenById.get(r.id)! },
      })
      if (result.ok) sent++; else failed++
    } catch {
      failed++
    }
  }
  return { sent, failed, skipped }
}

/** One email per leader row: each is its own role-scoped link, not grouped. */
async function resendLeaderLinks(rows: LeaderRow[], newTokenById: Map<string, string>): Promise<ResendCounts> {
  let sent = 0, failed = 0, skipped = 0
  for (const l of rows) {
    if (!l.email) { skipped++; continue }
    try {
      const result = await sendNotification({
        kind: "sector_leader_invite",
        recipient: { email: l.email, name: l.name },
        organizationId: l.event.organizationId,
        data: { leaderName: l.name, roleName: l.roleName, eventTitle: l.event.title, orgSlug: l.event.organization.slug, token: newTokenById.get(l.id)! },
      })
      if (result.ok) sent++; else failed++
    } catch {
      failed++
    }
  }
  return { sent, failed, skipped }
}

/** One email per invite row (unique per event + volunteer already). */
async function resendInviteLinks(rows: InviteRow[], newTokenById: Map<string, string>): Promise<ResendCounts> {
  let sent = 0, failed = 0, skipped = 0
  for (const i of rows) {
    if (!i.volunteer.email || !i.volunteer.active) { skipped++; continue }
    try {
      const result = await sendMemberInvite({
        to: i.volunteer.email,
        memberName: i.volunteer.firstName,
        organizationName: i.event.organization.name,
        eventTitle: i.event.title,
        eventDate: i.event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        eventLocation: i.event.location,
        orgSlug: i.event.organization.slug,
        eventSlug: i.event.slug,
        message: null,
        token: newTokenById.get(i.id)!,
        volunteerId: i.volunteerId,
        organizationId: i.event.organizationId,
      })
      if (result.ok) sent++; else failed++
    } catch {
      failed++
    }
  }
  return { sent, failed, skipped }
}
