// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * The proof that completes a pending session (pentest F6). Once a code is checked, the route asks
 * next-auth to update the session (`unstable_update`) with this proof; the jwt callback of
 * src/auth.ts accepts the update only if the proof is valid for that very token. A client can also
 * post to /api/auth/session with any data it likes: without the server's key it can't make a proof,
 * so that changes nothing.
 *
 * The proof never leaves the server (the update is an in-process call). It is bound to the account,
 * its sessionVersion and the sign-in's random nonce, so it can't complete another session of the same
 * account, and it expires within a minute.
 */

export const PROOF_TTL_MS = 60_000

export type ProofSubject = { sub: string; sessionVersion: number; loginNonce: string }

function proofKey(secret: string): Buffer {
  // A key of its own, derived from AUTH_SECRET with a label (never AUTH_SECRET itself as the key).
  return createHmac("sha256", secret).update("benevoles:second-factor-proof:v1").digest()
}

function mac(subject: ProofSubject, expiresAt: number, secret: string): string {
  return createHmac("sha256", proofKey(secret))
    .update(`${subject.sub}\n${subject.sessionVersion}\n${subject.loginNonce}\n${expiresAt}`)
    .digest("base64url")
}

export function createSecondFactorProof(subject: ProofSubject, nowMs: number, secret: string): string {
  const expiresAt = nowMs + PROOF_TTL_MS
  return `${expiresAt}.${mac(subject, expiresAt, secret)}`
}

export function verifySecondFactorProof(proof: unknown, subject: Partial<ProofSubject>, nowMs: number, secret: string | undefined): boolean {
  if (typeof proof !== "string" || proof.length > 200 || !secret) return false
  if (!subject.sub || typeof subject.sessionVersion !== "number" || !subject.loginNonce) return false
  const match = /^(\d{13,16})\.([A-Za-z0-9_-]{43})$/.exec(proof)
  if (!match) return false
  const expiresAt = Number(match[1])
  if (!(expiresAt > nowMs && expiresAt <= nowMs + PROOF_TTL_MS)) return false
  const expected = Buffer.from(mac(subject as ProofSubject, expiresAt, secret))
  const given = Buffer.from(match[2])
  return expected.length === given.length && timingSafeEqual(expected, given)
}
