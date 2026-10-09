// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { formatCount as count } from "@/lib/usage-counters"

/**
 * The self-service sign-up indicators of the super admin statistics (#810): they decide whether
 * the manual validation stays necessary. Pure, Prisma-free; the queries are in
 * src/lib/usage-stats.ts. Counts and durations only, no personal data.
 */

/** The window of the decision indicators: the operator's log keeps a year. */
export const INDICATOR_DAYS = 365
/** A space younger than this is not « never used » yet: its owner may still be preparing. */
export const UNUSED_AFTER_DAYS = 7

export type SignupFacts = {
  requests: number
  spaces: number
  approved: number
  refused: number
  /** Milliseconds from the sign-up to the validation, for the spaces validated in the window. */
  validationDelays: readonly number[]
  pending: number
  unused: number
  held: number
  dropped: number
  suspended: number
}

export type IndicatorRow = { key: string; label: string; value: string }

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** A delay in plain French: « 45 min », « 3 h 20 min », « 2 j 4 h ». */
export function formatDelay(ms: number | null): string {
  if (ms === null) return "Aucune validation"
  const minutes = Math.max(0, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return hours % 24 === 0 ? `${days} j` : `${days} j ${hours % 24} h`
}

export function signupIndicatorRows(f: SignupFacts): IndicatorRow[] {
  return [
    { key: "requests", label: "Demandes d'espace (depuis le début)", value: count(f.requests) },
    { key: "spaces", label: "Espaces créés par l'inscription (depuis le début)", value: count(f.spaces) },
    { key: "approved", label: "Espaces validés (12 derniers mois)", value: count(f.approved) },
    { key: "refused", label: "Espaces refusés (12 derniers mois)", value: count(f.refused) },
    { key: "delay", label: "Délai médian de validation (12 derniers mois)", value: formatDelay(median(f.validationDelays)) },
    { key: "pending", label: "Espaces en attente de validation", value: count(f.pending) },
    { key: "unused", label: `Espaces jamais utilisés (aucun événement, créés il y a plus de ${UNUSED_AFTER_DAYS} jours)`, value: count(f.unused) },
    { key: "held", label: "Envois reportés par un plafond d'envoi (depuis le début)", value: count(f.held) },
    { key: "dropped", label: "Envois abandonnés, trop d'emails à la même adresse (depuis le début)", value: count(f.dropped) },
    { key: "suspended", label: "Organisations suspendues", value: count(f.suspended) },
  ]
}
