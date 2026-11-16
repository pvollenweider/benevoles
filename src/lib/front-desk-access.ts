// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Front-desk access limited to one event (#1142), server only: whether an account holds a live
 * grant (AdminEventAccess) on an event, and the reads the owner panel and the landing page make
 * of it. Read on every request by the one guard that accepts the role
 * (requireFrontDeskOrOrganizer, src/lib/auth-guard.ts): a revocation, an expiry, an archived event
 * or an event that is over refuses the next request, whatever session is still open.
 */
import { prisma } from "./prisma"
import { FRONT_DESK_ROLE } from "./permissions"
import { orgTimeZone, localDateTimeToUtc } from "./time-zone"
import type { OrgScopedPrisma } from "./prisma-org"

export type GrantFacts = { revokedAt: Date | null; expiresAt: Date | null }

/**
 * What the read needs of the event: its status, its last day, and the organisation's time zone.
 * `endDate` is the stored UTC midnight of the last calendar day (like every event date).
 */
export type GrantEventFacts = { publicStatus: string; endDate: Date; timeZone: string }

/**
 * The morning after the event's last day, in the organisation's time zone: 06:00 local. Access
 * ends at the end of the last calendar day, but a night shift that runs past midnight on that
 * last day is a known limit of that rule (the shift is still running while its date is over):
 * the fixed 06:00 grace lets its front-desk person mark the people who leave at the end.
 * Computed with localDateTimeToUtc, so a daylight-saving change lands on 06:00 local too.
 */
export const FRONT_DESK_LAST_DAY_GRACE = "06:00"

/**
 * Front-desk invitations an organisation may send per day (#1142). Every authorised attempt
 * counts, sent or not, so the budget also bounds attempts on addresses that receive nothing (an
 * address held by another account gets the same neutral answer). One definition, imported by the
 * route: CONTRIBUTING, « Paramètres et limites par organisation ».
 */
export const FRONT_DESK_INVITES_PER_DAY = 20

/**
 * The open refusal for an address the owner already knows as an administrator of their own team
 * (#1142): a person who can already administer the organisation needs no front-desk access.
 * Unlike another organisation's account, this one is not hidden.
 */
export const FRONT_DESK_ALREADY_ADMIN = "Cette personne fait déjà partie de l'équipe d'administration de votre organisation : elle n'a pas besoin d'un accès accueil."

/**
 * The open refusal for a front-desk account of this organisation that was activated and later
 * deactivated (#1142): it is not a pending invitation, so it may not be silently re-invited.
 */
export const FRONT_DESK_ACCOUNT_DEACTIVATED = "Ce compte accueil a été désactivé."

/** The instant a grant on this event ends, in the organisation's time zone. */
export function frontDeskAccessEnd(event: Pick<GrantEventFacts, "endDate" | "timeZone">): Date {
  const lastDay = event.endDate.toISOString().slice(0, 10)
  // The next calendar day, as a UTC midnight, which localDateTimeToUtc reads as its Y/M/D.
  const nextDay = new Date(Date.parse(`${lastDay}T00:00:00Z`) + 86_400_000)
  return localDateTimeToUtc(nextDay, FRONT_DESK_LAST_DAY_GRACE, event.timeZone)
}

/**
 * The date and status rules of a grant, pure: revoked, never again; past `expiresAt`, dead (the
 * instant itself included); archived event, no access; and the event's own end ends it, whether
 * or not `expiresAt` was set: the later of the two never extends an access past the event.
 * Grants are created with `expiresAt` set to frontDeskAccessEnd, but the event may be moved
 * later, so the event's dates are read again here on every request.
 */
export function isGrantLive(grant: GrantFacts | null | undefined, event: GrantEventFacts | null | undefined, now: Date): boolean {
  if (!grant || !event) return false
  if (grant.revokedAt) return false
  if (event.publicStatus === "archived") return false
  if (now.getTime() >= frontDeskAccessEnd(event).getTime()) return false
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false
  return true
}

export type FrontDeskGrant = {
  id: string
  adminUserId: string
  eventId: string
  organizationId: string
  expiresAt: Date | null
  event: {
    id: string
    title: string
    startDate: Date
    endDate: Date
    publicStatus: string
    timeZone: string
    organizationName: string
  }
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
        event: {
          select: {
            id: true; organizationId: true; publicStatus: true; title: true; startDate: true; endDate: true
            organization: { select: { name: true; timeZone: true } }
          }
        }
      }
    }): Promise<{
      id: string; adminUserId: string; eventId: string; organizationId: string; expiresAt: Date | null; revokedAt: Date | null
      adminUser: { organizationId: string | null; isActive: boolean; role: string } | null
      event: {
        id: string; organizationId: string; publicStatus: string; title: string; startDate: Date; endDate: Date
        organization: { name: string; timeZone: string | null } | null
      } | null
    } | null>
  }
}

/**
 * The grant of `adminUserId` on `eventId`, only if all of this holds now: the row exists for this
 * account and this event, in this organisation; the account is still an active front-desk account
 * of this organisation; the event belongs to this organisation and is not archived; the grant is
 * neither revoked nor expired, and the event is not over (isGrantLive). Null otherwise, without
 * saying which rule failed.
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
      event: {
        select: {
          id: true, organizationId: true, publicStatus: true, title: true, startDate: true, endDate: true,
          organization: { select: { name: true, timeZone: true } },
        },
      },
    },
  })
  if (!row || !row.adminUser || !row.event) return null
  if (row.adminUserId !== adminUserId || row.eventId !== eventId || row.organizationId !== organizationId) return null
  if (row.adminUser.organizationId !== organizationId || !row.adminUser.isActive || row.adminUser.role !== FRONT_DESK_ROLE) return null
  if (row.event.id !== eventId || row.event.organizationId !== organizationId) return null
  const timeZone = orgTimeZone(row.event.organization)
  if (!isGrantLive(row, { publicStatus: row.event.publicStatus, endDate: row.event.endDate, timeZone }, now)) return null
  return {
    id: row.id, adminUserId: row.adminUserId, eventId: row.eventId, organizationId: row.organizationId, expiresAt: row.expiresAt,
    event: {
      id: row.event.id, title: row.event.title, startDate: row.event.startDate, endDate: row.event.endDate,
      publicStatus: row.event.publicStatus, timeZone, organizationName: row.event.organization?.name ?? "",
    },
  }
}

/**
 * What the owner panel shows for one grant. « Invitation envoyée » while the account has not
 * activated its password yet; « Actif » once it has; « Révoqué » as soon as an owner revoked it,
 * even after its end; « Expiré » when the grant or the event is over. The word is always shown.
 */
export type FrontDeskAccessStatus = "active" | "invitation_sent" | "revoked" | "expired"

export function frontDeskAccessStatus(
  input: { revokedAt: Date | null; expiresAt: Date | null; isActive: boolean; event: GrantEventFacts },
  now: Date,
): FrontDeskAccessStatus {
  if (input.revokedAt) return "revoked"
  if (!isGrantLive({ revokedAt: null, expiresAt: input.expiresAt }, input.event, now)) return "expired"
  return input.isActive ? "active" : "invitation_sent"
}

export type FrontDeskAccessView = {
  id: string
  name: string
  email: string
  status: FrontDeskAccessStatus
  /** Last day of the event, "YYYY-MM-DD": « Jusqu'au 14 juin 2026 inclus ». */
  endsOn: string
  /** The same day already worded for a French sentence, in the organisation's calendar. */
  endsOnLabel: string
}

/**
 * A stored event day (a Date at UTC midnight, or "YYYY-MM-DD") worded in French, read in UTC: the
 * same day on the server and in any browser, never shifted by the runtime's zone. Front-desk pages
 * use it for the dates of an event, as they do for its last day.
 */
export function formatFrontDeskDay(day: Date | string): string {
  const iso = typeof day === "string" ? day.slice(0, 10) : day.toISOString().slice(0, 10)
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
}

const endsOnLabel = (endsOn: string): string => formatFrontDeskDay(endsOn)

type AccessListReader = {
  adminEventAccess: {
    findMany(args: unknown): Promise<unknown[]>
  }
}

type AccessListRow = {
  id: string
  revokedAt: Date | null
  expiresAt: Date | null
  eventId: string
  adminUser: { name: string; email: string; isActive: boolean } | null
  event: {
    id: string
    title: string
    startDate: Date
    endDate: Date
    publicStatus: string
    organization: { timeZone: string | null } | null
  } | null
}

/**
 * The grants of one event, for its owner panel: the person's name, email, status and the event's
 * last day, never a token nor a hash. Read through the organisation's scoped client, which limits
 * the rows to its own events; the event relation is checked again here.
 */
export async function listEventFrontDeskAccesses(
  db: OrgScopedPrisma,
  eventId: string,
  now: Date,
): Promise<FrontDeskAccessView[]> {
  const rows = (await (db as unknown as AccessListReader).adminEventAccess.findMany({
    where: { eventId, adminUser: { role: FRONT_DESK_ROLE } },
    select: {
      id: true, revokedAt: true, expiresAt: true, eventId: true,
      adminUser: { select: { name: true, email: true, isActive: true } },
      event: {
        select: {
          id: true, title: true, startDate: true, endDate: true, publicStatus: true,
          organization: { select: { timeZone: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })) as AccessListRow[]
  return (rows ?? [])
    .filter((row) => row.event?.id === eventId && row.adminUser)
    .map((row) => {
      const event = row.event!
      const timeZone = orgTimeZone(event.organization)
      const endsOn = event.endDate.toISOString().slice(0, 10)
      return {
        id: row.id,
        name: row.adminUser!.name,
        email: row.adminUser!.email,
        status: frontDeskAccessStatus({ revokedAt: row.revokedAt, expiresAt: row.expiresAt, isActive: row.adminUser!.isActive, event: { publicStatus: event.publicStatus, endDate: event.endDate, timeZone } }, now),
        endsOn,
        endsOnLabel: endsOnLabel(endsOn),
      }
    })
}

export type FrontDeskEventLink = {
  accessId: string
  eventId: string
  eventTitle: string
  startDate: Date
  endDate: Date
}

/**
 * The person's live accesses, for the landing page: the session's account id and organisation,
 * never getOrgContext (a front-desk account is no administrator of the organisation). A revoked,
 * expired, archived or finished access is left out, exactly as the guard would refuse it.
 */
export async function loadFrontDeskAccesses(
  input: { adminUserId: string; organizationId: string; now: Date },
  db: AccessListReader = prisma as unknown as AccessListReader,
): Promise<FrontDeskEventLink[]> {
  const { adminUserId, organizationId, now } = input
  if (!adminUserId || !organizationId) return []
  const rows = (await db.adminEventAccess.findMany({
    where: {
      adminUserId,
      organizationId,
      adminUser: { organizationId, isActive: true, role: FRONT_DESK_ROLE },
      event: { organizationId },
    },
    select: {
      id: true, revokedAt: true, expiresAt: true, eventId: true,
      adminUser: { select: { name: true, email: true, isActive: true } },
      event: {
        select: {
          id: true, title: true, startDate: true, endDate: true, publicStatus: true,
          organization: { select: { timeZone: true } },
        },
      },
    },
  })) as AccessListRow[]
  return (rows ?? [])
    .filter((row) => row.event && row.adminUser?.isActive && row.event.id === row.eventId)
    .filter((row) => isGrantLive(row, { publicStatus: row.event!.publicStatus, endDate: row.event!.endDate, timeZone: orgTimeZone(row.event!.organization) }, now))
    .map((row) => ({ accessId: row.id, eventId: row.event!.id, eventTitle: row.event!.title, startDate: row.event!.startDate, endDate: row.event!.endDate }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.eventTitle.localeCompare(b.eventTitle, "fr"))
}
