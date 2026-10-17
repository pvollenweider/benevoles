// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, timingSafeEqual } from "crypto"

/**
 * Compares a secret value sent by a client (a token, a bearer secret) with the expected one in
 * constant time (#1048): `===` stops at the first differing character, which in theory lets a
 * caller guess a secret one character at a time from response times.
 *
 * `timingSafeEqual` throws on buffers of different lengths, and checking the lengths first would
 * itself tell the length; both sides are hashed to SHA-256 first, so the comparison always runs on
 * 32 bytes whatever was sent. A non-string or empty value never matches.
 */
export function safeEqual(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0 || expected.length === 0) return false
  const a = createHash("sha256").update(received, "utf8").digest()
  const b = createHash("sha256").update(expected, "utf8").digest()
  return timingSafeEqual(a, b)
}
