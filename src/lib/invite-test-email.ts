// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ORG_INACTIVE_REASON } from "@/lib/outbox-org-cancel-reason"
import { ORG_PENDING_REASON } from "@/lib/outbox-org-pending-reason"

/**
 * The test of a member invitation email (#1045): sent for the organisation of the session, so the
 * organisation send guard (#810, #814) and its sending limits apply, plus its own small quota per
 * organisation, like the test of the email settings. Pure and Prisma-free.
 */
export const INVITE_TEST_LIMIT = 5
export const INVITE_TEST_WINDOW_MS = 60 * 60 * 1000
export const INVITE_TEST_RATE_ERROR = "Cinq emails de test par heure au plus. Réessayez plus tard."

/** The status and French message of a refused test send; the SMTP reason never reaches the page. */
export function inviteTestFailure(result: { reason: string; held?: true }): { status: number; error: string } {
  if (result.reason === ORG_PENDING_REASON) {
    return { status: 403, error: "Votre espace est en attente de validation : l'email de test ne peut partir qu'à l'adresse d'un administrateur de l'espace qui a confirmé son adresse." }
  }
  if (result.reason === ORG_INACTIVE_REASON) return { status: 403, error: "Votre espace est désactivé : aucun email ne part." }
  if (result.held) return { status: 429, error: "La limite d'envoi de votre espace est atteinte. Réessayez plus tard." }
  return { status: 502, error: "Échec de l'envoi de l'email." }
}
