// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

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
