// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { orgStatus, type OrgState } from "@/lib/org-suspension"

/**
 * The operator's review of a space created by self-service sign-up (#810, part 4c): validate it
 * (both grants, src/lib/org-approval.ts) or refuse it (deleted with its accounts). Only a space
 * awaiting validation can be reviewed; a suspended one goes through the suspension, never here.
 * Pure: the route applies it.
 */

export type ReviewDecision = "approve" | "refuse"

export type ReviewOutcome =
  | { ok: true; decision: "approve"; update: { publicationApprovedAt: Date; outboundEmailApprovedAt: Date } }
  | { ok: true; decision: "refuse" }
  | { ok: false; status: 400 | 409; error: string }

export function decideReview(org: OrgState, decision: unknown, now: Date = new Date()): ReviewOutcome {
  if (decision !== "approve" && decision !== "refuse") return { ok: false, status: 400, error: "Décision inconnue : valider ou refuser." }
  if (orgStatus(org) !== "pending") return { ok: false, status: 409, error: "Cet espace n'est pas en attente de validation." }
  if (decision === "approve") return { ok: true, decision, update: { publicationApprovedAt: now, outboundEmailApprovedAt: now } }
  return { ok: true, decision }
}

/** Prisma filter of the spaces awaiting validation: active, not suspended, a grant missing. */
export const PENDING_ORG_WHERE: { active: true; suspendedAt: null; OR: ({ publicationApprovedAt: null } | { outboundEmailApprovedAt: null })[] } = {
  active: true,
  suspendedAt: null,
  OR: [{ publicationApprovedAt: null }, { outboundEmailApprovedAt: null }],
}

/** The daily summary sentence, or null when nothing waits (#810: one summary a day, not one per request). */
export function pendingSummary(createdAts: readonly Date[], now: Date): string | null {
  if (createdAts.length === 0) return null
  const late = createdAts.filter((d) => now.getTime() - d.getTime() > 24 * 60 * 60 * 1000).length
  const n = createdAts.length
  const head = `${n} espace${n > 1 ? "s attendent" : " attend"} une validation`
  return late > 0 ? `${head}, dont ${late} depuis plus de 24 heures.` : `${head}.`
}
