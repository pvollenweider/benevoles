// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * `lastError` of an email of an organisation awaiting validation (#810) addressed to someone other
 * than its administrators: cancelled, never sent. Prisma-free, read by src/lib/outbox-view.ts.
 */
export const ORG_PENDING_REASON = "org_pending"
