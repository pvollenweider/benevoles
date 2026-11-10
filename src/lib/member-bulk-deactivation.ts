// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the bulk deactivation of members (#1307): which selected records become inactive,
 * which are left alone (and why), and the sentence the members list announces afterwards.
 *
 * The rule mirrors the single « Désactiver » action: an active record that isn't a merge tombstone
 * becomes inactive; an already inactive record is left as it is (never counted as deactivated a
 * second time); a merged tombstone is ignored; an id missing from the organisation is "not found".
 *
 * No Prisma import (CLAUDE.md): the members list imports this module on the client, and the
 * server route reuses it through member-deactivation-transaction.ts.
 */

/** Most ids one request accepts. The client sends a bigger selection in batches of this size. */
export const BULK_DEACTIVATE_MAX = 500
/** How many ids the server handles in one transaction (a request may need several). */
export const BULK_DEACTIVATE_BATCH_SIZE = 100

export type BulkDeactivationSkipReason = "inactive" | "merged" | "notFound"

export interface BulkDeactivationMember {
  id: string
  firstName: string
  lastName: string
  active: boolean
  mergedIntoId: string | null
}

export interface BulkDeactivationSkipped {
  id: string
  /** Already inactive, a merged tombstone, or an id that isn't this organisation's. */
  reason: BulkDeactivationSkipReason
  /** « Prénom Nom », or null when the record isn't found (or is a nameless tombstone). */
  name: string | null
}

export interface BulkDeactivationPartition<M extends BulkDeactivationMember> {
  deactivatable: M[]
  skipped: BulkDeactivationSkipped[]
}

/** The selection's outcome, as the route returns it and as this module words it. */
export interface BulkDeactivationResult {
  deactivated: string[]
  skipped: BulkDeactivationSkipped[]
}

const displayName = (member: BulkDeactivationMember): string | null => `${member.firstName} ${member.lastName}`.trim() || null

/**
 * Splits the requested ids into the records to deactivate and the ones to leave alone, in the ids'
 * order and once per id. An id missing from `members` is "not found": the org-scoped client never
 * returns another organisation's record, so that is also how a foreign id is ignored.
 */
export function partitionMembersForBulkDeactivation<M extends BulkDeactivationMember>(
  ids: readonly string[],
  members: readonly M[],
): BulkDeactivationPartition<M> {
  const byId = new Map(members.map((member) => [member.id, member]))
  const deactivatable: M[] = []
  const skipped: BulkDeactivationSkipped[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const member = byId.get(id)
    if (!member) {
      skipped.push({ id, reason: "notFound", name: null })
      continue
    }
    const name = displayName(member)
    if (member.mergedIntoId) skipped.push({ id, reason: "merged", name })
    else if (!member.active) skipped.push({ id, reason: "inactive", name })
    else deactivatable.push(member)
  }

  return { deactivatable, skipped }
}

const n = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`

/**
 * What the list announces after a bulk deactivation, e.g. « 12 membres désactivés. 2 déjà inactifs. »
 * Singular, plural and the all-or-none cases are worded explicitly; merged tombstones and foreign
 * ids are said apart, like the bulk deletion's own result.
 */
export function bulkDeactivationResultText(result: BulkDeactivationResult): string {
  const parts: string[] = []
  const deactivated = result.deactivated.length

  if (deactivated === 0) parts.push("Aucun membre désactivé.")
  else parts.push(`${n(deactivated, "membre désactivé", "membres désactivés")}.`)

  const inactive = result.skipped.filter((entry) => entry.reason === "inactive").length
  if (inactive > 0) parts.push(`${inactive} déjà inactif${inactive > 1 ? "s" : ""}.`)

  const merged = result.skipped.filter((entry) => entry.reason === "merged").length
  if (merged > 0) parts.push(n(merged, "fiche fusionnée ignorée", "fiches fusionnées ignorées") + ".")

  const notFound = result.skipped.filter((entry) => entry.reason === "notFound").length
  if (notFound > 0) parts.push(`${n(notFound, "identifiant introuvable", "identifiants introuvables")} dans votre organisation.`)

  return parts.join(" ")
}
