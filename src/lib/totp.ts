// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac, randomBytes } from "node:crypto"

/**
 * One-time passwords of the super admin's second factor (pentest F6): HOTP (RFC 4226) and TOTP
 * (RFC 6238), with node:crypto only. The parameters every authenticator app understands: HMAC-SHA1,
 * 6 digits, 30-second steps, a 160-bit secret written in base32 (RFC 4648, no padding).
 *
 * Tested against the RFC 4226 appendix D and RFC 6238 appendix B vectors (totp.test.ts).
 */

export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
/** Steps accepted on each side of the current one: a phone clock off by up to 30 s still works. */
export const TOTP_WINDOW = 1
const SECRET_BYTES = 20

type Algorithm = "sha1" | "sha256" | "sha512"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/** Decodes base32, ignoring case, spaces, dashes and padding. Throws on any other character. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) throw new Error("Invalid base32 character")
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** HOTP (RFC 4226): the code of one counter value. */
export function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS, algorithm: Algorithm = "sha1"): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac(algorithm, secret).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, "0")
}

/** The 30-second step a time falls in (T in RFC 6238, with T0 = 0). */
export function timeStep(nowMs: number, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds)
}

/** TOTP (RFC 6238): the code at a given time. */
export function totp(secret: Uint8Array, nowMs: number, options: { digits?: number; algorithm?: Algorithm; stepSeconds?: number } = {}): string {
  return hotp(secret, timeStep(nowMs, options.stepSeconds), options.digits ?? TOTP_DIGITS, options.algorithm)
}

/** What the person typed, digits only (spaces and dashes dropped); null when it can't be a code. */
export function normalizeTotpCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "")
  return /^\d{6}$/.test(code) ? code : null
}

function sameCode(a: string, b: string): boolean {
  // Fixed-length digit strings: compare every character, whatever the first difference.
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * The step a code matches, within the window around now, or null. Steps up to `lastUsedStep` are
 * never accepted: a code already used (or an older one) can't be replayed, even within its 90 s.
 */
export function matchTotpStep(secret: Uint8Array, input: string, nowMs: number, lastUsedStep: number | null): number | null {
  const code = normalizeTotpCode(input)
  if (!code) return null
  const current = timeStep(nowMs)
  let matched: number | null = null
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    // Every candidate is computed, so the time taken doesn't say which step matched.
    if (sameCode(hotp(secret, step), code) && matched === null) matched = step
  }
  if (matched === null) return null
  if (lastUsedStep !== null && matched <= lastUsedStep) return null
  return matched
}

/** A new random secret, in base32 (32 characters for 160 bits). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES))
}

/** The secret in groups of four, easier to type into an app by hand. */
export function formatTotpSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, "$1 ")
}

/**
 * The otpauth:// address of the QR code (Key Uri Format read by authenticator apps). The label is
 * « issuer:account »; the parameters repeat the defaults explicitly for apps that need them.
 */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) })
  return `otpauth://totp/${label}?${params.toString()}`
}
