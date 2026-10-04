// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Just the constant from src/lib/outbox-merge-cancel.ts, in its own module with no other
 * dependency: src/lib/outbox-view.ts and src/lib/outbox-data.ts only need to recognize and
 * refuse this value, not the matching logic itself (which pulls in src/lib/notifications/outbox.ts,
 * and with it the `prisma` singleton — fine for the merge transaction, but it would needlessly
 * drag a live-DB-env dependency into the delivery page's read path and its unit tests).
 */
export const MERGED_MEMBER_CANCEL_REASON = "merged_member"
