// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Limits of the sign-up block list (#810), shared with its form (BlocklistManager): no node:crypto
 * here, unlike signup-blocklist.ts, so a client component can import them.
 */

export type BlockKind = "email" | "domain" | "ip"

export const REASON_MIN = 3
export const REASON_MAX = 300
export const IP_DEFAULT_DAYS = 7
export const IP_MAX_DAYS = 90
