// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { openPayload } from "./notifications/outbox"
import { INVITE_EMAIL_KEY_PREFIX, OUTSTANDING_OUTBOX_STATUSES, invitesWithEmailOutstanding } from "./invitation-sending"

type OutboxReader = {
  notificationOutbox: {
    findMany(args: { where: { organizationId: string; status: { in: string[] }; dedupeKey: { startsWith: string } }; select: { dedupeKey: true; payload: true } }): Promise<{ dedupeKey: string | null; payload: unknown }[]>
  }
}

/**
 * The invites (#1105) whose invitation email is still pending or being sent in the outbox, for
 * the address the member has now. Read inside the transaction that queues the next copy.
 */
export async function outstandingInviteEmails(tx: OutboxReader, organizationId: string, currentEmail: Map<string, string | null>): Promise<Set<string>> {
  if (currentEmail.size === 0) return new Set()
  const rows = await tx.notificationOutbox.findMany({
    where: { organizationId, status: { in: [...OUTSTANDING_OUTBOX_STATUSES] }, dedupeKey: { startsWith: INVITE_EMAIL_KEY_PREFIX } },
    select: { dedupeKey: true, payload: true },
  })
  return invitesWithEmailOutstanding(rows.map((r) => {
    let email: string | null = null
    try { email = openPayload(r.payload).recipient.email ?? null } catch { /* unreadable: counted, never a second copy */ }
    return { dedupeKey: r.dedupeKey, email }
  }), currentEmail)
}

type Locker = { $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number> }

/**
 * Takes the transaction-scoped advisory locks of these emails (#1105), the same ones « Renvoyer »
 * takes (retryOutboxRow): queuing a new copy and putting back a failed one are serialised, so
 * they cannot both find no twin and both send. Sorted, so two transactions never wait on each
 * other in opposite orders. Prefixes come from sameEmailKeyPrefix's formats.
 */
export async function lockSameEmails(tx: Locker, prefixes: string[]): Promise<void> {
  const keys = [...new Set(prefixes)].sort()
  if (keys.length === 0) return
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(k)) FROM unnest(${keys}::text[]) AS k ORDER BY k`
}
