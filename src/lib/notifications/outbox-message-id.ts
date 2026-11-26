// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes } from "crypto"
import { siteDomain } from "@/lib/site"

/**
 * The host of the stable Message-ID of an outbox row (#602 correlation). Kept apart from the
 * outbox worker so the bounce reader can use it without pulling in the email channel and Prisma.
 * Unchanged from `outboxMessageId`'s previous inline computation: the deployed public address's
 * hostname (including `www.`), falling back to the instance's domain.
 */
export function outboxMessageHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname || siteDomain()
  } catch {
    return siteDomain()
  }
}

/** Stable Message-ID per outbox row: a re-send after a crash is recognizable as the same email. */
export function outboxMessageId(rowId: string): string {
  return `<outbox-${rowId}@${outboxMessageHost()}>`
}

/** 20 random bytes, rendered as 40 lowercase hex characters: 160 bits, letters and digits only. */
const DIRECT_MESSAGE_REF_BYTES = 20

/**
 * Random reference of a direct send's Message-ID. A direct send has no outbox row to be
 * matched by, so it gets an unguessable reference that its DeliveryOutcome rows carry; a deferred
 * bounce then finds them by that reference alone. 160 bits make guessing one impractical, and the
 * reference says nothing about the organisation, the member or the kind: those come from our rows.
 */
export function directMessageRef(): string {
  return randomBytes(DIRECT_MESSAGE_REF_BYTES).toString("hex")
}

/** Message-ID of a direct send: `<direct-<ref>@<host>>`, recognisable by this deployment's bounce reader. */
export function directMessageId(ref: string): string {
  return `<direct-${ref}@${outboxMessageHost()}>`
}
