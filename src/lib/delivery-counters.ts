// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import {
  ACCOUNT_LINK_REVOKED_REASON,
  AVAILABILITY_LINK_REVOKED_REASON,
  LEADER_LINK_REVOKED_REASON,
  MEMBER_ADDRESS_CHANGED_REASON,
  PERSONAL_LINK_REVOKED_REASON,
} from "./outbox-address-changed-reason"
import { MEMBER_DELETED_CANCEL_REASON } from "./outbox-member-deleted-reason"
import { MERGED_MEMBER_CANCEL_REASON } from "./outbox-merge-cancel-reason"
import { ORG_INACTIVE_REASON } from "./outbox-org-cancel-reason"
import { ORG_PENDING_REASON } from "./outbox-org-pending-reason"

/**
 * Aggregated delivery counts of the transactional emails (#1269), folded from the outbox rows the
 * nightly cleanup deletes. A row per organisation (or platform), UTC day, kind and outcome; a
 * cancelled email also keeps the class of its cancellation reason. Nothing personal: no recipient,
 * no address, no content, no member id (see docs/retention.md).
 *
 * The day is the one the email was queued (`NotificationOutbox.createdAt`), not the day it is
 * purged: a row held by a sending limit, or a cleanup that ran late, still counts on its send day,
 * so « what was sent on 4 November » stays true after the purge.
 */

export const PLATFORM_ORGANIZATION_KEY = "platform"

export const DELIVERY_OUTCOMES = ["sent", "failed", "cancelled"] as const
export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number]

/** The kind of a row whose payload cannot be read (or carries no kind): counted, never dropped. */
export const UNKNOWN_KIND = "unknown"

export type DeliveryCountBucket = {
  organizationId: string | null
  /** Organisation id, or PLATFORM_ORGANIZATION_KEY: the non-null part of the unique key. */
  organizationKey: string
  day: Date
  kind: string
  outcome: DeliveryOutcome
  /** The cancellation reason class; "" for sent and failed rows. */
  reason: string
  count: number
}

/** The row fields the fold needs, from NotificationOutbox. */
export type DeliveryCountRow = {
  status: string
  lastError: string | null
  createdAt: Date
  organizationId: string | null
}

const KNOWN_CANCEL_REASONS = new Set<string>([
  ORG_INACTIVE_REASON,
  ORG_PENDING_REASON,
  MEMBER_ADDRESS_CHANGED_REASON,
  MEMBER_DELETED_CANCEL_REASON,
  MERGED_MEMBER_CANCEL_REASON,
  PERSONAL_LINK_REVOKED_REASON,
  ACCOUNT_LINK_REVOKED_REASON,
  LEADER_LINK_REVOKED_REASON,
  AVAILABILITY_LINK_REVOKED_REASON,
])

/** `limit:<name>` written by takeSendAllowance (src/lib/notifications/send-limits.ts). */
const LIMIT_REASON = /^limit:[a-z][a-z0-9_]{0,40}$/

/**
 * The class of a cancelled row's `lastError`, never its raw text: a limit code
 * (`limit:recipient_per_hour`, `limit:org_per_day`), a known cancellation code, a class for the
 * few fixed sentences the outbox stores, or `other`. A missing reason is `unknown`.
 *
 * The sentences are matched by their stable beginning, so a punctuation change does not turn them
 * into `other`; their text never reaches the counter. A new code that is not listed here is
 * `other` until it is added: the safe default, since `lastError` could hold anything.
 */
export function cancelReasonClass(lastError: string | null | undefined): string {
  const raw = lastError?.trim()
  if (!raw) return UNKNOWN_KIND
  if (KNOWN_CANCEL_REASONS.has(raw) || LIMIT_REASON.test(raw)) return raw
  if (raw.startsWith("Plus aucune inscription à annoncer")) return "nothing_left"
  if (raw.startsWith("Vérification d'inactivité arrêtée")) return "inactivity_stopped"
  if (raw.startsWith("Plus organisateur à cette adresse")) return "inactivity_no_admin"
  return "other"
}

/** The UTC day (midnight) of a queued email, the key the counts are grouped by. */
export function deliveryDay(createdAt: Date): Date {
  return new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()))
}

/** The outcome a purged row counts as, or null for a status the purge never selects. */
export function deliveryOutcome(status: string): DeliveryOutcome | null {
  return (DELIVERY_OUTCOMES as readonly string[]).includes(status) ? (status as DeliveryOutcome) : null
}

const bucketKey = (b: Pick<DeliveryCountBucket, "organizationKey" | "day" | "kind" | "outcome" | "reason">) =>
  [b.organizationKey, b.day.toISOString(), b.kind, b.outcome, b.reason].join("\u0000")

/**
 * Adds one purged row to the buckets, merging rows of the same organisation, day, kind, outcome
 * and reason. Pure; the caller upserts the buckets at the end.
 */
export function addDeliveryCount(buckets: Map<string, DeliveryCountBucket>, row: DeliveryCountRow & { kind: string }): boolean {
  const outcome = deliveryOutcome(row.status)
  if (!outcome) return false
  const organizationKey = row.organizationId ?? PLATFORM_ORGANIZATION_KEY
  const bucket: DeliveryCountBucket = {
    organizationId: row.organizationId,
    organizationKey,
    day: deliveryDay(row.createdAt),
    kind: row.kind || UNKNOWN_KIND,
    outcome,
    reason: outcome === "cancelled" ? cancelReasonClass(row.lastError) : "",
    count: 1,
  }
  const key = bucketKey(bucket)
  const existing = buckets.get(key)
  if (existing) existing.count++
  else buckets.set(key, bucket)
  return true
}
