// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fmt, crossesMidnight } from "@/lib/gantt-utils"
import { RESERVED_LABEL } from "@/lib/role-reservation"

/** One shift as the public timeline (DayTimeline) draws it. */
export type TimelineShift = {
  id: string
  roleName: string
  label: string
  startTime: string
  endTime: string
  status: string
  capacity: number
  registered: number
  spotsLeft: number
  displayOrder?: number
  waitlistEnabled?: boolean
  /** « Sur validation » (#484): a sign-up is a request the organizer accepts or refuses. */
  requiresApproval?: boolean
  minAge?: number | null
  colorKey?: string | null
}

/** What the visitor already holds on a shift (#534): their registration's live status. */
export type HeldKind = "active" | "requested" | "waiting" | "offered"

const HELD_KINDS: readonly string[] = ["active", "requested", "waiting", "offered"] satisfies HeldKind[]

/** Shift id → held kind, from the session's registrations. Other statuses are not held. */
export function heldKinds(registrations: { shiftId: string; status: string }[]): Map<string, HeldKind> {
  const held = new Map<string, HeldKind>()
  for (const r of registrations) {
    if (HELD_KINDS.includes(r.status)) held.set(r.shiftId, r.status as HeldKind)
  }
  return held
}

/** End of the bar's name for a held shift: said after the role and the hours. */
const HELD_NAME: Record<HeldKind, string> = {
  active: "inscription confirmée",
  requested: "demande envoyée, en attente de validation",
  waiting: "en liste d'attente",
  offered: "place proposée, à accepter sur ta page personnelle",
}

/** Visible tag under a held bar, first in its sub-label. */
const HELD_TAG: Record<HeldKind, string> = {
  active: "Ton créneau",
  requested: "Demande envoyée",
  waiting: "En liste d'attente",
  offered: "Place proposée",
}

export type BarTextInput = {
  shift: TimelineShift
  /** Held by the visitor: wins over selected, full, waitlist, conflict and reserved. */
  held?: HeldKind
  selected: boolean
  reserved: boolean
  locked: boolean
  /** Overlaps a shift already chosen or held: shown, not offered (its name must not offer it). */
  conflict?: boolean
  /** The role's limit per person, when it is reached (#466). */
  limitReached?: number
}

export type BarText = {
  /** The button's accessible name. */
  ariaLabel: string
  /** Held state in a word, shown first under the bar (aria-hidden: the name says it). */
  tag: string | null
  /** The rest of the line under the bar (label, age, approval, waitlist), or null. */
  subLabel: string | null
}

/**
 * Name and visible texts of one bar of the public timeline. The name begins with what the bar
 * shows (WCAG 2.5.3, #808): its hours (« +1 » past midnight), its « inscrits/places » count, or its
 * state word (« Complet », « Fermé », « Réservé », « En attente »), then the role and what a press
 * does. A narrow bar shows only the start time, which the name contains too.
 */
export function barText({ shift, held, selected, reserved, locked, conflict = false, limitReached }: BarTextInput): BarText {
  const hasLabel = shift.label !== shift.roleName
  const roleLabel = hasLabel ? `${shift.roleName} (${shift.label})` : shift.roleName
  const timeRange = `${fmt(shift.startTime)}–${fmt(shift.endTime)}`
  const overnight = crossesMidnight(shift.startTime, shift.endTime)
  // The +1 mark is shown; the name also spells it out.
  const timeShown = overnight ? `${timeRange} +1 (jusqu'au lendemain)` : timeRange
  const timeSpoken = overnight ? `${timeRange}, jusqu'au lendemain` : timeRange

  if (held) {
    return {
      ariaLabel: `${timeShown}, ${roleLabel} : ${HELD_NAME[held]}`,
      tag: HELD_TAG[held],
      subLabel: hasLabel ? shift.label : null,
    }
  }

  const isFull = shift.status === "full"
  const isClosed = shift.status === "closed"
  const isWaitlistable = isFull && (shift.waitlistEnabled ?? false)
  const unavail = (isFull && !isWaitlistable) || isClosed
  // Informational only: we don't know a first-time visitor's age until the form, so this never
  // blocks selection here; real enforcement is server-side at submit (see #192). Said in the name
  // since the visual sub-label is aria-hidden.
  const hasMinAge = shift.minAge != null
  const needsApproval = shift.requiresApproval ?? false
  const minAgeSuffix = (hasMinAge ? ` (${shift.minAge} ans minimum)` : "") + (needsApproval ? " (sur validation)" : "")
  // Skipped once full: the « Complet » / waitlist wording already says all that matters.
  const spotsSuffix = unavail ? "" : ` (${shift.spotsLeft} place${shift.spotsLeft > 1 ? "s" : ""} libre${shift.spotsLeft > 1 ? "s" : ""} sur ${shift.capacity})`
  const limitSuffix = !selected && limitReached !== undefined ? ` (limite de ${limitReached} par personne atteinte)` : ""
  // The « inscrits/places » count the bar shows while it can still be taken.
  const count = `${shift.registered}/${shift.capacity}`

  let ariaLabel: string
  if (reserved) ariaLabel = `Réservé, ${roleLabel} ${timeSpoken} : ${RESERVED_LABEL}`
  else if (unavail && !selected) ariaLabel = `${isClosed ? "Fermé" : "Complet"}, ${roleLabel} ${timeSpoken}${minAgeSuffix}`
  // A disabled bar must not offer an action: it says why it can't be chosen.
  else if (conflict && !selected) ariaLabel = `${timeShown} ${count}, ${roleLabel}${minAgeSuffix} : chevauche un créneau déjà choisi`
  else if (locked && !selected) ariaLabel = `${timeShown} ${count}, ${roleLabel}${minAgeSuffix}${spotsSuffix}`
  else if (isWaitlistable) {
    ariaLabel = selected
      ? `En attente ${count}, ${roleLabel} ${timeSpoken} : retirer de la file d'attente${minAgeSuffix}`
      : `${timeShown} ${count}, ${roleLabel}${minAgeSuffix} : rejoindre la file d'attente${limitSuffix}`
  } else {
    ariaLabel = `${timeShown} ${count}, ${roleLabel}${minAgeSuffix} : ${selected ? "désélectionner" : "sélectionner"}${spotsSuffix}${limitSuffix}`
  }

  const details = [
    isWaitlistable && !selected ? "Complet · file d'attente" : hasLabel ? shift.label : null,
    hasMinAge ? `${shift.minAge}+` : null,
    needsApproval ? "Sur validation" : null,
  ].filter(Boolean).join(" · ")

  return { ariaLabel, tag: null, subLabel: details || null }
}

/** What the visitor can do with one shift (#808): the same answer for the timeline and the list. */
export type ShiftViewState = {
  /** Held by the visitor: wins over every other state. */
  held: HeldKind | undefined
  selected: boolean
  conflict: boolean
  reserved: boolean
  full: boolean
  closed: boolean
  waitlistable: boolean
  /** Full without a waitlist, or closed. */
  unavailable: boolean
  /** The visual state of the bar (src/lib/roles.ts). */
  look: "selected" | "unavailable" | "default"
  /** Selecting or deselecting it does something. */
  clickable: boolean
}

export function shiftViewState({ shift, held, selected, conflict, reserved, locked }: {
  shift: Pick<TimelineShift, "status" | "waitlistEnabled">
  held?: HeldKind
  selected: boolean
  conflict: boolean
  reserved: boolean
  locked: boolean
}): ShiftViewState {
  const isHeld = !!held
  const isConflict = !isHeld && conflict
  const full = shift.status === "full"
  const closed = shift.status === "closed"
  const waitlistable = full && (shift.waitlistEnabled ?? false)
  const unavailable = !isHeld && ((full && !waitlistable) || closed)
  const isSelected = !isHeld && selected
  const isReserved = !isSelected && !isHeld && reserved
  const look = isSelected ? "selected" : (isConflict || unavailable || isReserved) ? "unavailable" : "default"
  const clickable = !isHeld && !isConflict && !unavailable && !isReserved && (!locked || isSelected)
  return { held, selected: isSelected, conflict: isConflict, reserved: isReserved, full, closed, waitlistable, unavailable, look, clickable }
}

/** The lines of one item of the list view (#808): its visible text is its accessible name. */
export function shiftListText(shift: TimelineShift, view: ShiftViewState, opts: { locked: boolean; limitReached?: number }): { title: string; status: string; details: string | null } {
  const roleLabel = shift.label !== shift.roleName ? `${shift.roleName} (${shift.label})` : shift.roleName
  const range = `${fmt(shift.startTime)}–${fmt(shift.endTime)}`
  const time = crossesMidnight(shift.startTime, shift.endTime) ? `${range} (jusqu'au lendemain)` : range
  const places = `${shift.spotsLeft} place${shift.spotsLeft > 1 ? "s" : ""} libre${shift.spotsLeft > 1 ? "s" : ""} sur ${shift.capacity}`
  const status = view.held
    ? HELD_TAG[view.held]
    : view.selected
      ? (view.waitlistable ? "En attente, sélectionné pour la file d'attente" : "Sélectionné")
      : view.conflict
        ? "Chevauche un créneau choisi"
        : view.reserved
          ? RESERVED_LABEL
          : view.closed
            ? "Fermé"
            : view.full
              ? (view.waitlistable ? "Complet · file d'attente" : "Complet")
              : opts.locked
                ? `Inscriptions fermées · ${places}`
                : opts.limitReached !== undefined
                  ? `Limite de ${opts.limitReached} par personne atteinte · ${places}`
                  : places
  const details = [
    shift.minAge != null ? `${shift.minAge} ans minimum` : null,
    shift.requiresApproval ? "Sur validation" : null,
  ].filter(Boolean).join(" · ")
  return { title: `${time} · ${roleLabel}`, status, details: details || null }
}
