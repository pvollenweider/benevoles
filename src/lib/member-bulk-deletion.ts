// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the bulk deletion of members (#1305): which selected records can go, which stay
 * (and why), and the sentence the members list announces afterwards.
 *
 * The rule is the single-member one (`memberDeletionEligibility`) with the one owner-decided
 * difference: an active record with no registration is deleted directly, because the explicit
 * confirmation of the selection replaces the deactivation step that made cleaning an imported CSV
 * so long. Records with a registration and merged tombstones stay excluded, exactly as before.
 *
 * No Prisma import (CLAUDE.md): the members list imports this module on the client, and the
 * server route reuses it through member-deletion-transaction.ts.
 */

import { MEMBER_DELETION_REASON, memberDeletionEligibility } from "./member-deletion"

/** Most ids one request accepts. The client sends a bigger selection in batches of this size. */
export const BULK_DELETE_MAX = 500
/** How many ids the server handles in one transaction (a request may need several). */
export const BULK_DELETE_BATCH_SIZE = 100

export type BulkDeletionSkipReason = "registrations" | "merged" | "notFound"

export interface BulkDeletionMember {
  id: string
  firstName: string
  lastName: string
  active: boolean
  mergedIntoId: string | null
}

export interface BulkDeletionSkipped {
  id: string
  /** Inscriptions to keep, a merged tombstone, or an id that isn't this organisation's. */
  reason: BulkDeletionSkipReason
  /** « Prénom Nom », or null when the record isn't found (or is a nameless tombstone). */
  name: string | null
}

export interface BulkDeletionPartition<M extends BulkDeletionMember> {
  deletable: M[]
  skipped: BulkDeletionSkipped[]
}

/** The selection's outcome, as the route returns it and as this module words it. */
export interface BulkDeletionResult {
  deleted: string[]
  skipped: BulkDeletionSkipped[]
}

type BulkDeletionDecision = { eligible: true } | { eligible: false; reason: Exclude<BulkDeletionSkipReason, "notFound"> }

const displayName = (member: BulkDeletionMember): string | null => `${member.firstName} ${member.lastName}`.trim() || null

/**
 * Whether one selected record can be deleted by the bulk action. Reuses the single-member rule
 * with `allowActive`, and maps its refusal to the result's reason (the "active" refusal can't
 * happen here). `registrationCount` must count every Registration row, every status included.
 */
export function bulkDeletionEligibility(member: BulkDeletionMember, registrationCount: number): BulkDeletionDecision {
  const verdict = memberDeletionEligibility(member, registrationCount, { allowActive: true })
  if (verdict.eligible) return { eligible: true }
  return {
    eligible: false,
    reason: verdict.reason === MEMBER_DELETION_REASON.tombstone ? "merged" : "registrations",
  }
}

/**
 * Splits the requested ids into the records to delete and the ones to skip, in the ids' order and
 * once per id. An id missing from `members` is "not found": the org-scoped client never returns
 * another organisation's record, so that is also how a foreign id is ignored.
 */
export function partitionMembersForBulkDeletion<M extends BulkDeletionMember>(
  ids: readonly string[],
  members: readonly M[],
  registrationCounts: ReadonlyMap<string, number>,
): BulkDeletionPartition<M> {
  const byId = new Map(members.map((member) => [member.id, member]))
  const deletable: M[] = []
  const skipped: BulkDeletionSkipped[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const member = byId.get(id)
    if (!member) {
      skipped.push({ id, reason: "notFound", name: null })
      continue
    }
    const decision = bulkDeletionEligibility(member, registrationCounts.get(id) ?? 0)
    if (decision.eligible) deletable.push(member)
    else skipped.push({ id, reason: decision.reason, name: displayName(member) })
  }

  return { deletable, skipped }
}

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`
const names = (skipped: BulkDeletionSkipped[]) => {
  const found = skipped.map((entry) => entry.name).filter((name): name is string => !!name)
  return found.length > 0 ? ` : ${found.join(", ")}` : ""
}

/**
 * What the list announces after a bulk deletion, e.g. « 198 membres supprimés. 3 laissés car ils
 * ont des inscriptions : Anne Favre, Marc Rochat, Léa Dubois. Vous pouvez les effacer depuis leur
 * fiche. » Singular, plural and the all-or-none cases are worded explicitly.
 */
export function bulkDeletionResultText(result: BulkDeletionResult): string {
  const parts: string[] = []
  const deleted = result.deleted.length

  if (deleted === 0) parts.push("Aucun membre supprimé.")
  else parts.push(`${n(deleted, "membre supprimé", "membres supprimés")}.`)

  const withRegistrations = result.skipped.filter((entry) => entry.reason === "registrations")
  if (withRegistrations.length === 1) {
    parts.push(`1 laissé car il a des inscriptions${names(withRegistrations)}. Vous pouvez l'effacer depuis sa fiche.`)
  } else if (withRegistrations.length > 1) {
    parts.push(`${withRegistrations.length} laissés car ils ont des inscriptions${names(withRegistrations)}. Vous pouvez les effacer depuis leur fiche.`)
  }

  const merged = result.skipped.filter((entry) => entry.reason === "merged")
  if (merged.length === 1) {
    parts.push(`1 laissé car la fiche est fusionnée${names(merged)}.`)
  } else if (merged.length > 1) {
    parts.push(`${merged.length} laissés car les fiches sont fusionnées${names(merged)}.`)
  }

  const notFound = result.skipped.filter((entry) => entry.reason === "notFound")
  if (notFound.length > 0) {
    parts.push(`${n(notFound.length, "identifiant introuvable", "identifiants introuvables")} dans votre organisation.`)
  }

  return parts.join(" ")
}
