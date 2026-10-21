// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * French labels for the stored values of a logged change (#929): « statut : liste d'attente →
 * place proposée » instead of « waiting → offered ». Same wording as the rest of the admin UI
 * (StatusBadge, RegistrationRow's source, ShiftsManager), lowercased because the value sits in
 * the middle of a change line. Pure, no Prisma: rendered in client components.
 *
 * Only display: the stored log and its CSV/JSON exports keep the raw values.
 */
import type { EventPublicStatus, RegistrationSource, RegistrationStatus, ShiftStatus } from "./statuses"

export const REGISTRATION_STATUS_LOG_LABELS: Record<RegistrationStatus, string> = {
  active: "confirmée",
  waiting: "liste d'attente",
  offered: "place proposée",
  requested: "demande à traiter",
  cancelled: "annulée",
  refused: "refusée",
  deleted: "supprimée",
}

export const SHIFT_STATUS_LOG_LABELS: Record<ShiftStatus, string> = {
  open: "ouvert",
  full: "complet",
  closed: "fermé",
  cancelled: "annulé",
}

export const REGISTRATION_SOURCE_LOG_LABELS: Record<RegistrationSource, string> = {
  public_form: "formulaire",
  admin_manual: "manuel",
}

export const EVENT_PUBLIC_STATUS_LOG_LABELS: Record<EventPublicStatus, string> = {
  draft: "brouillon",
  published: "publié",
  archived: "archivé",
}

/** A volunteer's shift roster choice (#1068), « nom affiché aux autres bénévoles : masqué → affiché ». */
export const ROSTER_CHOICE_LOG_LABELS: Record<string, string> = {
  visible: "affiché",
  pending: "à confirmer",
  hidden: "masqué",
}

function lookup(map: Record<string, string>, value: string): string | undefined {
  return Object.hasOwn(map, value) ? map[value] : undefined
}

/**
 * The French label of `value` for the logged `field`, or undefined when there is none (unknown
 * field or value: the caller shows the raw value). `status` is shared by shifts and registrations;
 * `entityType` picks the right list, which matters for the agreement of « annulé(e) ». Without
 * it, a value is looked up in the registration list first, then in the shift list.
 */
export function logValueLabel(field: string, value: unknown, entityType?: string): string | undefined {
  if (typeof value !== "string") return undefined
  switch (field) {
    case "status":
      if (entityType === "Shift") return lookup(SHIFT_STATUS_LOG_LABELS, value)
      if (entityType === "Registration") return lookup(REGISTRATION_STATUS_LOG_LABELS, value)
      return lookup(REGISTRATION_STATUS_LOG_LABELS, value) ?? lookup(SHIFT_STATUS_LOG_LABELS, value)
    case "source":
      return lookup(REGISTRATION_SOURCE_LOG_LABELS, value)
    case "publicStatus":
      return lookup(EVENT_PUBLIC_STATUS_LOG_LABELS, value)
    case "rosterName":
      return lookup(ROSTER_CHOICE_LOG_LABELS, value)
    default:
      return undefined
  }
}
