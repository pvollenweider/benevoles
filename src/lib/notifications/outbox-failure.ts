// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { SmtpReason } from "./smtp-outcome"

/**
 * Groups a definitive outbox failure by what it says about the platform: a refusal caused
 * by the recipient's own address is not a delivery outage, while every other failure (relay,
 * policy, timeout, unknown reason, non-SMTP error…) is something to look at.
 */
export type OutboxFailureGroup = "recipient" | "other"

/**
 * The reasons that mean the address itself is wrong. `mailbox_full` is deliberately absent: a full
 * mailbox is temporary and says nothing about the address being mistyped.
 */
const RECIPIENT_ADDRESS_REASONS: ReadonlySet<string> = new Set<SmtpReason>([
  "mailbox_unknown",
  "mailbox_disabled",
  "domain_not_found",
])

/**
 * Classifies a stored `NotificationOutbox.lastError` from the structured prefix written by the
 * email channel: `smtp:<outcome>:<reason>:<code>:<enhanced>`. Only the first three fields are read,
 * and neither they nor the result contain the address — the stored code never carries it.
 */
export function outboxFailureGroup(lastError: string | null | undefined): OutboxFailureGroup {
  if (!lastError) return "other"
  const [prefix, outcome, reason] = lastError.split(":")
  return prefix === "smtp" && outcome === "rejected_permanent" && RECIPIENT_ADDRESS_REASONS.has(reason)
    ? "recipient"
    : "other"
}
