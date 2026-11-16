// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash, randomBytes } from "node:crypto"

/**
 * Recovery codes of the second factor (pentest F6), for a lost phone: ten per account, each used
 * once. 80 random bits per code, written as 16 characters of Crockford's base32 in four groups
 * (« 7k3m-x2qp-9h4d-r8tw »): no I, L, O or U, so a code copied by hand from paper can't be misread,
 * and an o, i or l typed anyway reads as 0 or 1. Only their SHA-256 is stored: with 80 bits of
 * entropy, a database dump can't be turned back into codes, so no salt or slow hash is needed.
 */

export const RECOVERY_CODE_COUNT = 10
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"

/** One new code, formatted for display. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10)
  let bits = 0
  let value = 0
  let raw = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      raw += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return raw.match(/.{4}/g)!.join("-")
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>()
  while (codes.size < count) codes.add(generateRecoveryCode())
  return [...codes]
}

/**
 * What the person typed, in the stored form: lower case, without spaces (non-breaking ones too) or
 * dashes, o read as 0 and i or l as 1. Null when it can't be a recovery code, so nothing is looked
 * up for it.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toLowerCase().replace(/[\s\u00a0\u202f-]/g, "").replace(/o/g, "0").replace(/[il]/g, "1")
  return /^[0-9a-hjkmnp-tv-z]{16}$/.test(code) ? code : null
}

/** SHA-256 (hex) of a normalized code: what the database keeps. */
export function hashRecoveryCode(normalized: string): string {
  return createHash("sha256").update(`recovery-code:${normalized}`).digest("hex")
}
