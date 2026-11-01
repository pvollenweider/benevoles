// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { JWT } from "next-auth/jwt"
import { verifySecondFactorProof } from "./second-factor-proof"

/** The key of the proof in the data of a session update (see second-factor-proof.ts). */
export const PROOF_FIELD = "secondFactorProof"

/**
 * A session update (trigger "update" of the jwt callback): marks the second factor as given when,
 * and only when, the update carries a valid proof for this token. Returns whether it did.
 */
export function acceptSecondFactorUpdate(token: JWT, data: unknown, nowMs: number, secret = process.env.AUTH_SECRET): boolean {
  const proof = data && typeof data === "object" ? (data as Record<string, unknown>)[PROOF_FIELD] : undefined
  if (!verifySecondFactorProof(proof, { sub: token.sub, sessionVersion: token.sessionVersion ?? 0, loginNonce: token.loginNonce }, nowMs, secret)) return false
  token.secondFactorAt = nowMs
  return true
}
