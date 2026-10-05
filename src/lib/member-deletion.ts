// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure eligibility rule for permanently deleting a member record (#667, owner decision): a
 * record can be deleted when it is inactive AND has no registration at all, whatever the status
 * (active, waiting, offered, requested, cancelled, refused, deleted — "deleted" here means a
 * cancelled Registration row, kept for history; nothing database-wide is ever named "deleted"
 * registration status in this codebase, but the issue's own wording covers whatever status a row
 * can hold). A merged tombstone (#600, `mergedIntoId` set) is never offered either: it has no
 * registrations of its own (merge reassigns them all) but is purged by retention instead, so
 * deleting it by hand would race that cron for nothing.
 *
 * Deliberately pure (no Prisma import): used both server-side (the route, via
 * member-deletion-data.ts) and client-side (MembersManager, the member page) to show the same
 * reason in words without a round trip. See CLAUDE.md: a Prisma import here would break Turbopack
 * for every client component that imports this module.
 */

export type MemberDeletionEligibility =
  | { eligible: true }
  | { eligible: false; reason: string }

export const MEMBER_DELETION_REASON = {
  tombstone: "C'est une fiche fusionnée : elle sera supprimée automatiquement par la purge de rétention.",
  active: "Cette fiche est encore active. Désactivez-la d'abord.",
  hasRegistrations: "Cette fiche a des inscriptions, quel que soit leur statut : elles doivent rester dans l'historique des événements.",
} as const

export interface MemberDeletionSubject {
  active: boolean
  mergedIntoId: string | null
}

/**
 * The rule itself. `registrationCount` must count every Registration row of the member, every
 * status included — the caller must not pre-filter by status.
 */
export function memberDeletionEligibility(member: MemberDeletionSubject, registrationCount: number): MemberDeletionEligibility {
  if (member.mergedIntoId) return { eligible: false, reason: MEMBER_DELETION_REASON.tombstone }
  if (member.active) return { eligible: false, reason: MEMBER_DELETION_REASON.active }
  if (registrationCount > 0) return { eligible: false, reason: MEMBER_DELETION_REASON.hasRegistrations }
  return { eligible: true }
}
