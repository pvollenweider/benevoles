// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sector leader notifications (#186). A leader is scoped to one roleName within an event, or to
 * one sector (#1169); when a volunteer signs up for a shift of a poste, every leader whose scope
 * covers it gets an email (once per address) pointing back to their read-only roster.
 */
import { prisma } from "./prisma"
import { sendNotification, type Send } from "./notifications"
import { reportError } from "./report-error"
import { linkToken } from "./token-vault"
import { leadersCoveringRole } from "./leader-scope-data"

export async function notifySectorLeadersOfSignup(params: {
  eventId: string
  eventTitle: string
  orgSlug: string
  volunteerName: string
  shift: { roleName: string; label: string; date: Date; startTime: string; endTime: string }
}, send: Send = sendNotification): Promise<void> {
  // The poste's leaders and its current sector's (#1169), once per address.
  const leaders = await leadersCoveringRole(prisma, params.eventId, params.shift.roleName)
  if (leaders.length === 0) return

  await Promise.all(
    leaders.map((leader) =>
      send({
        kind: "sector_leader_new_signup",
        recipient: { email: leader.email, name: leader.name },
        data: {
          leaderName: leader.name,
          // The poste of the shift: a sector leader's row has none (#1169), the email names the sector.
          roleName: params.shift.roleName,
          ...(leader.sectorId ? { sectorName: leader.sector?.name ?? null } : {}),
          eventTitle: params.eventTitle,
          volunteerName: params.volunteerName,
          shiftLabel: params.shift.label,
          shiftDate: params.shift.date.toLocaleDateString("fr-FR"),
          startTime: params.shift.startTime,
          endTime: params.shift.endTime,
          orgSlug: params.orgSlug,
          token: linkToken.reveal(leader),
        },
      }).catch(reportError("notification.sector_leader_signup"))
    )
  )
}

/**
 * Keeps the member pool's "responsable" tag (`src/app/admin/members`) in sync with sector-leader
 * status, so admins can spot/filter responsables from the member list too, not just the
 * per-event sector-leaders page. Org-scoped explicitly (not via the request's `db` client, since
 * this is shared logic called from more than one route) — mirrors the isolation the extended
 * Prisma client would otherwise apply automatically.
 */
const RESPONSABLE_TAG = "responsable"

export async function tagVolunteerAsResponsable(organizationId: string, email: string): Promise<void> {
  const volunteer = await prisma.volunteer.findFirst({ where: { organizationId, email } })
  if (!volunteer || volunteer.tags.includes(RESPONSABLE_TAG)) return
  await prisma.volunteer.update({ where: { id: volunteer.id }, data: { tags: { push: RESPONSABLE_TAG } } })
}

/**
 * Removes the tag only if the volunteer isn't a sector leader for anything else in this org
 * (they can lead several roles/events at once — losing one shouldn't untag them).
 */
export async function untagVolunteerIfNoLongerResponsable(organizationId: string, email: string): Promise<void> {
  const stillLeading = await prisma.sectorLeader.findFirst({ where: { email, event: { organizationId } } })
  if (stillLeading) return
  const volunteer = await prisma.volunteer.findFirst({ where: { organizationId, email } })
  if (!volunteer || !volunteer.tags.includes(RESPONSABLE_TAG)) return
  await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: { tags: volunteer.tags.filter((t) => t !== RESPONSABLE_TAG) },
  })
}

/**
 * Pure helpers (no db access) for flagging a registrations-list row as "Responsable" of its own
 * shift's role, without a second round trip from the client — see registrations/page.tsx.
 * SectorLeader is keyed by (eventId, roleName, email), not a volunteerId FK (a leader isn't
 * necessarily a registered volunteer and doesn't need an account), so matching is by role + email.
 */
export type SectorLeaderRef = { roleName: string | null; email: string }

function leaderKey(roleName: string, email: string): string {
  return `${roleName}\0${email.toLowerCase()}`
}

export function leaderKeySet(leaders: SectorLeaderRef[]): Set<string> {
  // Poste leaders only: the registrations list's « Responsable » flag and « Rendre responsable » are per poste.
  return new Set(leaders.flatMap((l) => (l.roleName ? [leaderKey(l.roleName, l.email)] : [])))
}

// True when `email` is a registered sector leader of `roleName` for this event. Emails are
// compared case-insensitively — SectorLeader.email and Volunteer.email aren't guaranteed to have
// been typed with the same casing.
export function isSectorLeader(keys: Set<string>, roleName: string, email: string | null): boolean {
  if (!email) return false
  return keys.has(leaderKey(roleName, email))
}
