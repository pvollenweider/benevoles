// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * `lastError` of an email cancelled because its organisation was deactivated or deleted (#814): a
 * code, like MERGED_MEMBER_CANCEL_REASON; the delivery page turns it into a sentence
 * (outboxErrorSentence).
 * Its own Prisma-free module, like outbox-merge-cancel-reason.ts: src/lib/outbox-view.ts reads it
 * and must stay free of the database client.
 */
export const ORG_INACTIVE_REASON = "org_inactive"
