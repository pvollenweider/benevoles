/**
 * Unsubscribe link signing for product-update emails (#200). Stateless — no token column on
 * AdminUser, no extra table: the link is `?admin=<id>&token=<hmac>`, verified by recomputing the
 * HMAC server-side. Reuses AUTH_SECRET (already required, already a secret) instead of adding a
 * new one.
 */
import { createHmac } from "crypto"
import { env } from "./env"

export function unsubscribeToken(adminId: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(adminId).digest("hex").slice(0, 32)
}

export function verifyUnsubscribeToken(adminId: string, token: string): boolean {
  return token === unsubscribeToken(adminId)
}
