// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { selfCancelDeadline, type CancelDeadlineSetting, type ShiftWhen } from "./cancel-deadline"
import { roleLimitBreaches } from "./role-limit"
import { memberMayTake } from "./role-reservation"
import { shiftsClash } from "./shift-overlap"
import { shiftsTooYoungFor } from "./utils"

/**
 * Shift swaps between volunteers (#1174, beta capability « shiftSwaps »): Pierre and Jean each hold
 * a confirmed registration of the same event and trade them. The rules, pure (no Prisma): the swap
 * transaction (src/lib/shift-swap-server.ts) reads the rows under lock and asks these functions.
 *
 * - Compatible shifts (`swapCompatibility`): two confirmed (`active`) registrations of two people,
 *   on two different live shifts of the same event, neither poste « attribué par l'organisation
 *   uniquement » (#1145), and the same poste, or two postes of the same identified sector (#1175:
 *   `Shift.sectorId`, shared by every shift of a poste; a poste without a sector is compatible with
 *   itself only, null never equals null). The scope comes from the missions' postes, never from
 *   the people (no team, no membership opens a way across sectors).
 * - Each person (`personSwapCheck`): their plan with the shift they give away removed must accept
 *   the shift they receive, with the sign-up's own functions: overlap (#986), limit per volunteer
 *   (#466), minimum age (#192), reserved tags (#470), no second live registration on that shift.
 * - Timing (`swapDeadline`): everything happens strictly before the earliest of the request's
 *   expiry and each given-away shift's self-cancellation deadline (#946; the shift's start by
 *   default), so a swap never gets round the event's cancellation deadline.
 * - Approval (`needsSwapApproval`): either shift « sur validation » (#484), or the event asks to
 *   approve every swap. An approval never overrides one of the rules above: they run again.
 * - Material terms (`materialTerms`): what an agreement is about. A change of one of them (time,
 *   place, poste, requirements) between the agreement and the application ends the request.
 */

/** A request that still reserves its registrations against another request (one at a time). */
export const SWAP_LIVE_STATUSES = ["open", "offered", "approval"] as const
/** The statuses in which the counterpart's registration belongs to the request too. */
export const SWAP_COUNTER_LIVE_STATUSES = ["offered", "approval"] as const

export type SwapLiveStatus = (typeof SWAP_LIVE_STATUSES)[number]
export type SwapStatus = SwapLiveStatus | "applied" | "withdrawn" | "refused" | "expired" | "impossible" | "cancelled"

export function isLiveSwapStatus(status: string): status is SwapLiveStatus {
  return (SWAP_LIVE_STATUSES as readonly string[]).includes(status)
}

/** Why a check refuses a swap; also stored as the `endReason` of a request it ends. */
export type SwapRefusalCode =
  | "same_person"
  | "same_registration"
  | "other_event"
  | "not_confirmed"
  | "shift_cancelled"
  | "same_shift"
  | "assigned_only"
  | "other_poste"
  | "other_sector"
  | "volunteer_gone"
  | "already_on_shift"
  | "overlap"
  | "role_limit"
  | "min_age"
  | "reserved"
  | "deadline"
  // Workload protection (#1171): one code per rule, never which of the two plans breaks it.
  | "workload_continuous"
  | "workload_daily"
  | "workload_event"
  | "workload_rest"
  | "workload_idle"
  | "workload_incomplete"
  // Lot 2 (#1171): days off, meals, travel between places, two places at once, a missing birth date.
  | "workload_offday"
  | "workload_meal"
  | "workload_travel"
  | "workload_places"
  | "workload_birthdate"
  // AUTHZ-08: an offer the requester's own situation stops (age, tag, overlap, limit, workload):
  // one code for all, so the offerer never learns which.
  | "not_possible"

/** Why a request ended other than by a person's own choice. */
export type SwapEndReason =
  | SwapRefusalCode
  | "registration_gone"
  | "shift_changed"
  | "sector_changed"
  | "link_revoked"
  | "option_off"
  | "organiser"

export type SwapCheck = { ok: true } | { ok: false; code: SwapRefusalCode }

const OK: SwapCheck = { ok: true }
const refuse = (code: SwapRefusalCode): SwapCheck => ({ ok: false, code })

/** A shift as the swap rules read it. */
export type SwapShift = ShiftWhen & {
  id: string
  eventId: string
  roleName: string
  status: string
  endTime: string
  overlapAllowed?: boolean | null
  assignedOnly?: boolean | null
  requiresApproval?: boolean | null
  minAge?: number | null
  reservedTags?: string[] | null
  locationDetails?: string | null
  latitude?: number | null
  longitude?: number | null
  sectorId?: string | null
}

/** A registration as the swap rules read it. */
export type SwapRegistration = { id: string; volunteerId: string; eventId: string; status: string; shift: SwapShift }

/**
 * Whether two registrations can be swapped, whoever holds them (#1174 E01, E03). `assignedOnlyRoles`:
 * the event's roles assigned by the organisation only (`assignedOnlyRoles` of src/lib/role-assignment.ts,
 * read from all the event's live shifts), so a shift that missed the setting never opens the role.
 */
export function swapCompatibility(a: SwapRegistration, b: SwapRegistration, ctx: { assignedOnlyRoles: Set<string> }): SwapCheck {
  if (a.id === b.id) return refuse("same_registration")
  if (a.volunteerId === b.volunteerId) return refuse("same_person")
  if (a.eventId !== b.eventId || a.shift.eventId !== a.eventId || b.shift.eventId !== b.eventId) return refuse("other_event")
  if (a.status !== "active" || b.status !== "active") return refuse("not_confirmed")
  if (a.shift.status === "cancelled" || b.shift.status === "cancelled") return refuse("shift_cancelled")
  if (a.shift.id === b.shift.id) return refuse("same_shift")
  for (const s of [a.shift, b.shift]) {
    if (s.assignedOnly || ctx.assignedOnlyRoles.has(s.roleName)) return refuse("assigned_only")
  }
  if (a.shift.roleName === b.shift.roleName) return OK
  // Two postes (#1175): only inside one identified sector. Without any sector, the postes differ.
  if (!a.shift.sectorId && !b.shift.sectorId) return refuse("other_poste")
  if (!a.shift.sectorId || !b.shift.sectorId || a.shift.sectorId !== b.shift.sectorId) return refuse("other_sector")
  return OK
}

/** What a person's own record says, read under the volunteer lock. */
export type SwapPerson = {
  active: boolean
  erasedAt?: Date | string | null
  mergedIntoId?: string | null
  birthDate?: Date | string | null
  tags: string[]
}

/** One of the person's live registrations of the event (any live status), with its shift. */
export type HeldRegistration = { id: string; status: string; shift: SwapShift }

/** Statuses that commit the person to the hours, as for the sign-up (COMMITTED_STATUSES). */
const COMMITTED = new Set(["active", "requested"])

/**
 * Whether `person` can take `receiving` once `giving` is gone from their plan (#1174): the sign-up's
 * rules, on every live registration of the event they hold (`held`, `giving` included or not).
 * `reserved`: the roles reserved to tags (`reservedRoles`); `limits`: the limits per role
 * (`roleLimits`), both read from all the event's shifts of the roles concerned.
 */
export function personSwapCheck(input: {
  person: SwapPerson
  giving: { id: string }
  receiving: SwapShift
  held: HeldRegistration[]
  reserved: Map<string, string[]>
  limits: Map<string, number>
}): SwapCheck {
  const { person, giving, receiving, reserved, limits } = input
  if (!person.active || person.erasedAt || person.mergedIntoId) return refuse("volunteer_gone")
  const kept = input.held.filter((h) => h.id !== giving.id)
  // The partial unique index allows one live registration per person and shift.
  if (kept.some((h) => h.shift.id === receiving.id)) return refuse("already_on_shift")
  if (kept.some((h) => COMMITTED.has(h.status) && shiftsClash(h.shift, receiving))) return refuse("overlap")
  if (roleLimitBreaches([receiving], kept.map((h) => h.shift), limits).length > 0) return refuse("role_limit")
  if (receiving.minAge != null) {
    // Fails closed, as the sign-up: no known birth date never reaches a minimum age.
    if (!person.birthDate || shiftsTooYoungFor(person.birthDate, [{ minAge: receiving.minAge, date: receiving.date }]).length > 0) return refuse("min_age")
  }
  const required = reserved.get(receiving.roleName)
  if (required && !memberMayTake(person.tags, required)) return refuse("reserved")
  return OK
}

/**
 * The last instant the swap can still happen (strictly before it): the earliest of the request's
 * own expiry and each given-away shift's self-cancellation deadline (#946), in the organisation's
 * zone. With no earlier deadline on the event, that is the start of the first of the two shifts.
 */
export function swapDeadline(input: { expiresAt: Date; given: ShiftWhen[]; setting: CancelDeadlineSetting | null | undefined; timeZone: string }): Date {
  let t = input.expiresAt.getTime()
  for (const shift of input.given) t = Math.min(t, selfCancelDeadline(shift, input.setting, input.timeZone).getTime())
  return new Date(t)
}

/** Whether a step taken at `now` is still in time. */
export function beforeSwapDeadline(now: Date, deadline: Date): boolean {
  return now.getTime() < deadline.getTime()
}

/** Whether an organiser must approve the swap before it is applied (#1174 E04, E05). */
export function needsSwapApproval(a: { requiresApproval?: boolean | null }, b: { requiresApproval?: boolean | null }, event: { shiftSwapsApproval?: boolean | null }): boolean {
  return !!(event.shiftSwapsApproval || a.requiresApproval || b.requiresApproval)
}

const dayString = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toISOString().slice(0, 10)

/**
 * The material terms of a shift (#1174 E09, E13): what changes the mission (time, place, poste,
 * requirements), as one canonical string. Its label, description, instructions, contacts, capacity
 * « sur validation » and sector are left out: a typo fix keeps the agreement, and the approval rule
 * and the swap's scope (the poste, the sector in #1175) are read again at each step anyway.
 */
export function materialTerms(shift: SwapShift): string {
  return JSON.stringify([
    shift.id,
    shift.eventId,
    shift.roleName,
    dayString(shift.date),
    shift.startTime,
    shift.endTime,
    shift.status === "cancelled",
    (shift.locationDetails ?? "").trim(),
    shift.latitude ?? null,
    shift.longitude ?? null,
    shift.minAge ?? null,
    [...(shift.reservedTags ?? [])].map((t) => t.trim().toLocaleLowerCase("fr")).filter(Boolean).sort(),
    !!shift.assignedOnly,
  ])
}

/** Whether an edit of a shift changes its material terms (the open requests on it then end). */
export function shiftMateriallyChanged(before: SwapShift, after: SwapShift): boolean {
  return materialTerms(before) !== materialTerms(after)
}

/** The terms both people agree on: the two shifts, in the request's order. */
export function agreementTerms(requesterShift: SwapShift, counterShift: SwapShift): string {
  return `${materialTerms(requesterShift)}|${materialTerms(counterShift)}`
}

// ── Words ───────────────────────────────────────────────────────────────────

/**
 * Why a swap cannot happen, in the volunteers' register. Never names the other person's mission
 * nor which of the two plans breaks a rule: « Cet échange crée un conflit d'horaire » is enough.
 */
/** An offer the requester's own situation stops (AUTHZ-08): said to the offerer, without why. */
export const SWAP_OFFER_NOT_POSSIBLE = "Cet échange n'est pas possible avec ce créneau. Propose un autre de tes créneaux."

export function swapRefusalMessage(code: SwapEndReason): string {
  switch (code) {
    case "overlap":
      return "Cet échange crée un conflit d'horaire."
    case "role_limit":
      return "Cet échange dépasse le nombre de créneaux autorisé par personne pour ce poste."
    case "min_age":
    case "reserved":
      return "Cet échange ne respecte pas les conditions d'inscription d'un des deux créneaux."
    case "already_on_shift":
      return "L'une des deux personnes est déjà inscrite sur l'autre créneau."
    case "deadline":
      return "Le délai pour cet échange est passé."
    case "volunteer_gone":
    case "registration_gone":
    case "not_confirmed":
      return "L'une des deux inscriptions n'est plus confirmée."
    case "shift_cancelled":
      return "L'un des deux créneaux a été annulé."
    case "shift_changed":
      return "L'un des deux créneaux a changé (horaire, lieu, poste ou conditions)."
    case "link_revoked":
      return "Le lien personnel de l'une des deux personnes a été renouvelé."
    case "option_off":
      return "L'organisation a désactivé les échanges de créneaux pour cet événement."
    case "organiser":
      return "L'organisation n'a pas validé cet échange."
    case "assigned_only":
      return "Ce poste est attribué par l'organisation : il ne s'échange pas entre bénévoles."
    case "other_poste":
      return "Ces deux créneaux ne sont pas du même poste : ils ne peuvent pas s'échanger."
    case "other_sector":
      // Volunteers never see sectors (#1175): the words say the postes, not why.
      return "Ces deux postes ne permettent pas un échange de créneaux."
    case "sector_changed":
      return "L'organisation des postes a changé : cet échange n'est plus possible."
    case "not_possible":
      return "Cet échange n'est pas possible avec ces deux créneaux."
    case "same_person":
    case "same_registration":
    case "same_shift":
    case "other_event":
      return "Ces deux créneaux ne peuvent pas s'échanger."
    case "workload_continuous":
      return "Cet échange ne peut pas être effectué : la durée maximale sans vraie pause ne serait pas respectée."
    case "workload_daily":
      return "Cet échange ne peut pas être effectué : la durée maximale de missions par journée de service serait dépassée."
    case "workload_event":
      return "Cet échange ne peut pas être effectué : la durée maximale de missions sur l'événement serait dépassée."
    case "workload_rest":
      return "Cet échange ne peut pas être effectué : le repos minimum ne serait pas respecté."
    case "workload_idle":
      return "Cet échange ne peut pas être effectué : l'attente entre deux missions dépasserait la limite de l'événement."
    case "workload_incomplete":
      return "Cet échange ne peut pas être effectué : la protection des pauses et de la charge de l'événement est incomplète."
    case "workload_offday":
      return "Cet échange ne peut pas être effectué : les jours sans mission demandés par l'événement ne seraient pas respectés."
    case "workload_meal":
      return "Cet échange ne peut pas être effectué : la pause repas ne serait pas respectée."
    case "workload_travel":
      return "Cet échange ne peut pas être effectué : la marge de trajet entre deux lieux ne serait pas respectée."
    case "workload_places":
      return "Cet échange ne peut pas être effectué : deux missions auraient lieu en même temps à deux lieux différents."
    case "workload_birthdate":
      return "Cet échange ne peut pas être effectué : cet événement protège les moins de 18 ans et une date de naissance manque."
  }
}
