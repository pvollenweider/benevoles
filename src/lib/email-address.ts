// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Email addresses are compared and stored normalized (#310): trimmed and lower-cased, so
 * `Alice@Example.com` and `alice@example.com` are the same volunteer / admin. (The local part
 * is case-sensitive in theory; in practice every provider ignores case.)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
