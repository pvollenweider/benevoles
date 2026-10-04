// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "../prisma"
import { env } from "../env"
import { reportError } from "../report-error"
import { addressHash, type RecipientOutcome } from "./smtp-outcome"

/**
 * Persistence of per-recipient SMTP outcomes (#598). Kept apart from the pure classifier
 * (smtp-outcome.ts) and from the email channel: this is the only place that writes
 * `DeliveryOutcome` rows, so it's the one place to check for what ends up in the database.
 */

export type DeliveryOutcomeContext = {
  kind: string
  organizationId?: string | null
  volunteerId?: string | null
  outboxId?: string | null
}

/**
 * Kinds with no member involved at all (decision, #598): a row here would only ever have
 * `volunteerId: null`, and brings nothing to #599 (there is no member whose address to flag).
 * `product_update` (super admin → organization admins) is the unambiguous case; a super-admin org
 * invite shares the `admin_invite` kind with a regular org invite, which does involve staff the
 * organization itself manages, so that one keeps its row (with `volunteerId: null`).
 */
const NOT_RECORDED_KINDS = new Set(["product_update"])

/**
 * Stores one recipient's outcome. Never throws: a recording failure is reported to Sentry
 * (context only — code, category, kind — never the address or the server reply) and otherwise
 * swallowed, so it can't turn an already-decided send result into something else, and can't crash
 * the request that triggered the send.
 */
export async function recordDeliveryOutcome(ctx: DeliveryOutcomeContext, outcome: RecipientOutcome): Promise<void> {
  if (NOT_RECORDED_KINDS.has(ctx.kind)) return
  try {
    await prisma.deliveryOutcome.create({
      data: {
        organizationId: ctx.organizationId ?? null,
        volunteerId: ctx.volunteerId ?? null,
        outboxId: ctx.outboxId ?? null,
        kind: ctx.kind,
        outcome: outcome.outcome,
        reason: outcome.reason,
        responseCode: outcome.responseCode,
        enhancedStatus: outcome.enhancedStatus,
        addressHash: outcome.recipient ? addressHash(outcome.recipient, env.AUTH_SECRET) : null,
      },
    })
  } catch (e) {
    reportError("delivery_outcome.record_failed")(e)
  }
}

export async function recordDeliveryOutcomes(ctx: DeliveryOutcomeContext, outcomes: RecipientOutcome[]): Promise<void> {
  for (const outcome of outcomes) await recordDeliveryOutcome(ctx, outcome)
}
