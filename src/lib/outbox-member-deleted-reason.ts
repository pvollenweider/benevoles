// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * `lastError` of an email cancelled because its member was deleted (#667, #815). Its own
 * Prisma-free module, like outbox-merge-cancel-reason.ts: src/lib/outbox-view.ts reads it and must
 * stay free of the database client.
 */
export const MEMBER_DELETED_CANCEL_REASON = "member_deleted"
