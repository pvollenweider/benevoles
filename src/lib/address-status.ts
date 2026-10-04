// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { RETENTION_DAYS } from "./retention"

/**
 * Whether a member's current email address needs checking (#599), from the delivery outcomes
 * #598 recorded. Pure: no Prisma, no crypto — the loader hashes the member's current address with
 * `addressHash` (AUTH_SECRET is server-only) and passes the hash in here, next to the member's
 * recent outcomes (any address, any organization already filtered by the loader).
 *
 * Rule: only the outcomes recorded for the member's CURRENT address (matching hash) count, and
 * only the latest one of those decides the status — a later acceptance clears an earlier
 * rejection, and changing the address starts from a clean slate (the old failures keep their old
 * hash, which no longer matches). Outcomes older than the retention window are ignored: a row that
 * outlives it is deleted by the nightly cleanup anyway, but a status computed just before that
 * run must not jump ahead of it.
 */

export type AddressOutcomeInput = {
  addressHash: string | null
  outcome: string
  createdAt: Date
}

export type AddressStatus =
  | { kind: "ok" }
  | { kind: "to_verify"; since: Date }
  | { kind: "temporary_incident"; since: Date }

/** Plain explanation, never blaming the person (#599, GDPR wording requirement). */
export const ADDRESS_STATUS_EXPLANATION: Record<"to_verify" | "temporary_incident", string> = {
  to_verify: "boîte inexistante ou adresse refusée par le serveur",
  temporary_incident: "nouvel essai prévu",
}

export const ADDRESS_STATUS_LABEL: Record<"to_verify" | "temporary_incident", string> = {
  to_verify: "Adresse à vérifier",
  temporary_incident: "Incident temporaire",
}

export function addressStatus(
  currentAddressHash: string | null,
  outcomes: AddressOutcomeInput[],
  now: Date = new Date(),
  retentionDays: number = RETENTION_DAYS.deliveryOutcome,
): AddressStatus {
  if (!currentAddressHash) return { kind: "ok" }
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000)
  const matching = outcomes
    .filter((o) => o.addressHash === currentAddressHash && o.createdAt >= cutoff)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const latest = matching[0]
  if (!latest) return { kind: "ok" }
  if (latest.outcome === "rejected_permanent") return { kind: "to_verify", since: latest.createdAt }
  if (latest.outcome === "failed_temporary") return { kind: "temporary_incident", since: latest.createdAt }
  return { kind: "ok" }
}

/** One sentence for the member page and the members list, with the date in French. */
export function addressStatusSentence(status: AddressStatus | AddressStatusView, formatDate: (d: Date) => string): string | null {
  if (status.kind === "ok") return null
  const explanation = ADDRESS_STATUS_EXPLANATION[status.kind]
  const label = ADDRESS_STATUS_LABEL[status.kind]
  const since = typeof status.since === "string" ? new Date(status.since) : status.since
  return `${label} (${formatDate(since)}) : ${explanation}.`
}

/**
 * Client-safe form of AddressStatus (`since` as an ISO string): MembersManager is a Client
 * Component, and the codebase's own convention (volunteer-hours.ts's lastShiftDate) is to cross
 * that boundary with strings, not Date instances.
 */
export type AddressStatusView =
  | { kind: "ok" }
  | { kind: "to_verify"; since: string }
  | { kind: "temporary_incident"; since: string }

export function serializeAddressStatus(status: AddressStatus): AddressStatusView {
  if (status.kind === "ok") return status
  return { kind: status.kind, since: status.since.toISOString() }
}
