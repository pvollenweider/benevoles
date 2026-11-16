// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The seeded pseudo-random generator of the assignment proposal (#1172): the only source of chance
 * in the search, so the same inputs, seed and budget always give the same proposal. Versioned: a
 * later change of the generator changes `PRNG_VERSION`, and a stored run says which one it used.
 * Mulberry32, 32-bit state; not for anything secret.
 */

export const PRNG_VERSION = "mulberry32-1"

export type Prng = {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [0, n), n ≥ 1. */
  int(n: number): number
  /** One element of a non-empty list. */
  pick<T>(list: readonly T[]): T
}

/** The seed as an unsigned 32-bit integer: any finite number is accepted, the same number gives the same seed. */
export function normaliseSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  return Math.trunc(seed) >>> 0
}

export function createPrng(seed: number): Prng {
  let state = normaliseSeed(seed)
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (n) => Math.floor(next() * Math.max(1, Math.trunc(n))),
    pick: (list) => list[Math.floor(next() * list.length)],
  }
}
