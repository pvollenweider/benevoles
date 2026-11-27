// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { RETENTION_DAYS } from "./retention"

/**
 * Whether a member's current email address needs checking (#599), from the delivery outcomes
 * #598 recorded. Pure: no Prisma, no crypto — the loader hashes the member's current address with
 * `addressHash` (AUTH_SECRET is server-only) and passes the hash in here, next to the member's
 * recent outcomes (any address, any organization already filtered by the loader).
 *
 * Rule: only the outcomes recorded for the member's CURRENT address (matching hash) count;
 * changing the address starts from a clean slate (the old failures keep their old hash, which no
 * longer matches). Outcomes older than the retention window are ignored: a row that outlives it is
 * deleted by the nightly cleanup anyway, but a status computed just before that run must not jump
 * ahead of it.
 *
 * A permanent rejection keeps the address « to verify » until an email accepted AFTER it has stayed
 * `ACCEPTANCE_PROOF_HOURS` without a new rejection (#1477). « Accepted » only means our relay took
 * the message: a mailbox that bounces after acceptance gets every reminder accepted first, so an
 * acceptance that cleared the mark at once made it vanish at each send, until the bounce was read.
 * Without a rejection, the latest outcome decides, as before.
 */

/** How long an accepted email must stay without a bounce before it counts as proof the address works. */
export const ACCEPTANCE_PROOF_HOURS = 48

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
  const rejection = matching.find((o) => o.outcome === "rejected_permanent")
  if (rejection) {
    // Newest first: every outcome before `rejection` in the list was recorded after it, and none
    // of those is a rejection. One of them proves the address only once it has aged enough.
    const proofBefore = now.getTime() - ACCEPTANCE_PROOF_HOURS * 60 * 60 * 1000
    const proven = matching.some((o) => o.outcome === "accepted_by_relay" && o.createdAt > rejection.createdAt && o.createdAt.getTime() <= proofBefore)
    if (!proven) return { kind: "to_verify", since: rejection.createdAt }
  }
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
