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
import type { SwapEndReason } from "./shift-swaps"
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
  admin_draft: "affectation publiée",
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

/** Who sees a volunteer's name (#1068), « nom visible par : bénévoles confirmés → bénévoles confirmés et membres invités ». */
export const ROSTER_AUDIENCE_LOG_LABELS: Record<string, string> = {
  confirmed: "bénévoles confirmés",
  confirmed_and_invited: "bénévoles confirmés et membres invités",
}

/** A shift swap request's state (#1174), « demande d'échange : ouverte → proposition en attente ». */
export const SWAP_STATUS_LOG_LABELS: Record<string, string> = {
  open: "ouverte",
  offered: "proposition en attente",
  approval: "validation attendue",
  applied: "échange effectué",
  withdrawn: "retirée",
  refused: "non validée",
  expired: "expirée",
  impossible: "devenue impossible",
  cancelled: "annulée par l'organisation",
}

/** Why a shift swap request ended (#1174): the codes of SwapEndReason (src/lib/shift-swaps.ts). */
export const SWAP_REASON_LOG_LABELS: Record<SwapEndReason, string> = {
  overlap: "conflit d'horaire",
  role_limit: "limite de créneaux par personne",
  min_age: "âge minimum",
  reserved: "poste réservé",
  already_on_shift: "déjà inscrit sur l'autre créneau",
  not_possible: "conditions d'une des deux personnes",
  deadline: "délai passé",
  volunteer_gone: "inscription plus confirmée",
  registration_gone: "inscription plus confirmée",
  not_confirmed: "inscription plus confirmée",
  shift_cancelled: "créneau annulé",
  shift_changed: "créneau modifié",
  link_revoked: "lien personnel renouvelé",
  option_off: "échanges désactivés",
  organiser: "refus de l'organisation",
  assigned_only: "poste attribué par l'organisation",
  other_poste: "postes différents",
  other_sector: "postes de secteurs différents",
  sector_changed: "poste déplacé dans un autre secteur",
  same_person: "même personne",
  same_registration: "même inscription",
  same_shift: "même créneau",
  other_event: "autre événement",
  workload_continuous: "durée sans vraie pause",
  workload_daily: "durée par journée de service",
  workload_event: "durée sur l'événement",
  workload_rest: "repos minimum",
  workload_idle: "attente entre deux missions",
  workload_incomplete: "protection des pauses incomplète",
  workload_offday: "jours sans mission",
  workload_meal: "pause repas",
  workload_travel: "trajet entre deux lieux",
  workload_places: "deux lieux à la fois",
  workload_birthdate: "date de naissance manquante",
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
    case "rosterAudience":
      return lookup(ROSTER_AUDIENCE_LOG_LABELS, value)
    case "swapStatus":
      return lookup(SWAP_STATUS_LOG_LABELS, value)
    case "swapReason":
      return lookup(SWAP_REASON_LOG_LABELS as Record<string, string>, value)
    default:
      return undefined
  }
}
