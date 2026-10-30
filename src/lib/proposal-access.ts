// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { usesAvailability } from "./availability-assist"
import { canAdoptBeta } from "./beta-access"
import type { OrgScopedPrisma } from "./prisma-org"

/**
 * Who may use generated proposals on an event (#1172), checked by every proposal route: the event
 * is this organisation's and uses dated availability, and either it already has a run (an event
 * that adopted proposals keeps them after the beta closes, BE06) or the organisation may adopt the
 * beta capability « assignmentProposals » now. Until that capability is shipped nobody can adopt it,
 * so nothing can be stored through these routes.
 */

export const PROPOSALS_CLOSED = "La proposition d'affectations n'est pas ouverte pour cette organisation."

export type ProposalAccess = { ok: true } | { ok: false; status: 403 | 404 | 409; error: string }

export async function proposalAccess(db: OrgScopedPrisma, organizationId: string, eventId: string): Promise<ProposalAccess> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true, availabilityEnabled: true, availabilityAdoptedAt: true } })
  if (!event) return { ok: false, status: 404, error: "Événement introuvable." }
  if (!usesAvailability(event)) return { ok: false, status: 409, error: "Cet événement ne recueille pas les disponibilités." }
  if ((await db.proposalRun.count({ where: { eventId } })) > 0) return { ok: true }
  if (await canAdoptBeta(organizationId, "assignmentProposals")) return { ok: true }
  return { ok: false, status: 403, error: PROPOSALS_CLOSED }
}
