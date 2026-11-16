// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Unsubscribe link signing for product-update emails (#200). Stateless — no token column on
 * AdminUser, no extra table: the link is `?admin=<id>&token=<hmac>`, verified by recomputing the
 * HMAC server-side.
 *
 * The key derives from AUTH_SECRET (already required, already a secret) with HKDF and a label of
 * its own, so this purpose never uses the session secret itself. Links signed before that, with
 * AUTH_SECRET directly, have no version prefix: they sit in emails already delivered and never
 * expire, so they keep working (until AUTH_SECRET is rotated, which ends every link anyway).
 */
import { createHmac, hkdfSync } from "crypto"
import { env } from "./env"
import { safeEqual } from "./safe-equal"

const VERSION = "v2-"
const KEY_LABEL = "benevol product-updates unsubscribe v1"

/** The unsubscribe key derived from AUTH_SECRET (HKDF-SHA256, purpose label as `info`). */
export function unsubscribeKey(authSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret, "", KEY_LABEL, 32))
}

const sign = (key: Buffer | string, adminId: string) => createHmac("sha256", key).update(adminId).digest("hex").slice(0, 32)

export function unsubscribeToken(adminId: string): string {
  return `${VERSION}${sign(unsubscribeKey(env.AUTH_SECRET), adminId)}`
}

export function verifyUnsubscribeToken(adminId: string, token: string): boolean {
  if (token.startsWith(VERSION)) return safeEqual(token, unsubscribeToken(adminId))
  // A link from an email sent before the derived key (no version prefix).
  return safeEqual(token, sign(env.AUTH_SECRET, adminId))
}
