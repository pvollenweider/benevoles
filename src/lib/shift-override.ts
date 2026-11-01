// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { spokenShift } from "./spoken-time"

/**
 * An organiser placing someone on a shift that is full or closed (AUTHZ-15, owner decision
 * 2026-11-01): possible, but knowingly. Every organiser path that adds a person to a shift (manual
 * add, accepting a request, « Rétablir ») asks first, and the server refuses without the
 * confirmation; a cancelled shift is refused outright until it is reopened. Swap approval is the
 * one exception: both shifts keep the same number of people, and a cancelled shift already ends it.
 *
 * Pure, shared by the routes (which judge under the shift lock) and the pages (which word the
 * confirmation). Like the availability acknowledgement (#1146), a confirmation is a key bound to
 * what was shown: the action, the person or registration, the shift, its status, its places and
 * how many hold one. Another sign-up or a status change meanwhile asks again.
 */

const NBSP = " "

/** What a confirmation unlocks. */
export type OverrideVia = "manual_add" | "accept" | "restore"

/** The shift as read under its lock: `occupied` counts the spots held by others (OCCUPYING_STATUSES). */
export type ShiftCapacityState = {
  id: string
  status: string
  capacity: number
  occupied: number
}

/** A shift that needs the organiser's confirmation, with what the page needs to word it. */
export type ShiftOverrideNeed = {
  shiftId: string
  key: string
  /** Inscriptions « Fermées ». */
  closed: boolean
  /** Every place taken, or the shift marked « Complet » by hand. */
  full: boolean
  /** Marked « Complet » by hand while places remain. */
  markedFull: boolean
  occupied: number
  capacity: number
}

export type ShiftGuard =
  | { kind: "ok" }
  | { kind: "cancelled" }
  | { kind: "confirm"; need: ShiftOverrideNeed }

export function shiftOverrideKey(via: OverrideVia, subjectId: string, s: ShiftCapacityState): string {
  return ["o1", via, subjectId, s.id, s.status, s.occupied, s.capacity].join("|")
}

/**
 * Whether placing one more person on the shift is plain, needs a confirmation, or is refused.
 * `subjectId`: the person for a manual add, the registration for an acceptance or a restore.
 */
export function guardShiftPlacement(via: OverrideVia, subjectId: string, s: ShiftCapacityState): ShiftGuard {
  if (s.status === "cancelled") return { kind: "cancelled" }
  const closed = s.status === "closed"
  const exhausted = s.occupied >= s.capacity
  const markedFull = s.status === "full" && !exhausted
  const full = exhausted || markedFull
  if (!closed && !full) return { kind: "ok" }
  return { kind: "confirm", need: { shiftId: s.id, key: shiftOverrideKey(via, subjectId, s), closed, full, markedFull, occupied: s.occupied, capacity: s.capacity } }
}

/** The refusal on a cancelled shift: the organiser reopens it first. */
export function cancelledShiftMessage(label?: string): string {
  return `${label ? `Le créneau « ${label} »` : "Ce créneau"} est annulé${NBSP}: rien n'a été fait. Rouvrez d'abord le créneau.`
}

/** « complet, 5 places sur 5 sont prises », « inscriptions fermées, 2 places sur 5 sont prises ». */
export function overrideStateText(n: Pick<ShiftOverrideNeed, "closed" | "full" | "markedFull" | "occupied" | "capacity">): string {
  const parts: string[] = []
  if (n.full) parts.push(n.markedFull ? "marqué complet" : "complet")
  if (n.closed) parts.push("inscriptions fermées")
  return `${parts.join(", ")}, ${takenText(n)}`
}

/** What the event log keeps (« complet, 6 sur 5 »): the state confirmed, after the addition. */
export function overrideLogValue(n: Pick<ShiftOverrideNeed, "closed" | "full" | "markedFull" | "occupied" | "capacity">): string {
  const parts: string[] = []
  if (n.full) parts.push(n.markedFull ? "marqué complet" : "complet")
  if (n.closed) parts.push("inscriptions fermées")
  return `${parts.join(", ")}, ${n.occupied + 1} sur ${n.capacity}`
}

/** The 409 body a route answers when a confirmation is missing or stale. */
export type ShiftOverrideBody = {
  error: string
  code: "shift_override"
  shifts: (ShiftOverrideNeed & { roleName: string; label: string; date: string; startTime: string; endTime: string })[]
}

type ShiftWords = { roleName: string; label: string; date: string; startTime: string; endTime: string }

/** The plain message of the refusal, for a client that does not show the dialog. */
export function shiftOverrideError(needs: ShiftOverrideNeed[]): string {
  return needs.length > 1
    ? `${needs.length} créneaux choisis sont complets ou fermés. Confirmez pour ajouter quand même${NBSP}: rien n'a été ajouté.`
    : `${overrideStateSentence(needs[0])} Confirmez pour ajouter quand même${NBSP}: rien n'a été ajouté.`
}

export function shiftOverrideBody(needs: (ShiftOverrideNeed & ShiftWords)[]): ShiftOverrideBody {
  return { error: shiftOverrideError(needs), code: "shift_override", shifts: needs }
}

/** Reads a 409 answer: the shifts to confirm, or null when it is another refusal. */
export function shiftOverrideOf(data: unknown): ShiftOverrideBody["shifts"] | null {
  const d = data as { code?: unknown; shifts?: unknown } | null
  return d && d.code === "shift_override" && Array.isArray(d.shifts) && d.shifts.length > 0 ? (d.shifts as ShiftOverrideBody["shifts"]) : null
}

const VERB: Record<OverrideVia, (name: string) => string> = {
  manual_add: (name) => `Ajouter ${name} quand même${NBSP}?`,
  accept: (name) => `Accepter la demande de ${name} quand même${NBSP}?`,
  restore: (name) => `Rétablir l'inscription de ${name} quand même${NBSP}?`,
}

export const OVERRIDE_CONFIRM_LABEL: Record<OverrideVia, string> = {
  manual_add: "Ajouter quand même",
  accept: "Accepter quand même",
  restore: "Rétablir quand même",
}

/** « 5 places sur 5 sont prises », « 1 place sur 2 est prise », « aucune place sur 3 n'est prise ». */
export function takenText(n: Pick<ShiftOverrideNeed, "occupied" | "capacity">): string {
  if (n.occupied === 0) return `aucune place sur ${n.capacity} n'est prise`
  return `${n.occupied} ${n.occupied > 1 ? "places" : "place"} sur ${n.capacity} ${n.occupied > 1 ? "sont prises" : "est prise"}`
}

/** « Il y aura 6 personnes pour 5 places. » */
export function afterText(n: Pick<ShiftOverrideNeed, "occupied" | "capacity">): string {
  const after = n.occupied + 1
  return `Il y aura ${after} ${after > 1 ? "personnes" : "personne"} pour ${n.capacity} ${n.capacity > 1 ? "places" : "place"}.`
}

/** « Ce créneau est complet : 5 places sur 5 sont prises. », « Les inscriptions à ce créneau sont fermées. » */
export function overrideStateSentence(n: Pick<ShiftOverrideNeed, "closed" | "full" | "markedFull" | "occupied" | "capacity">): string {
  const parts: string[] = []
  if (n.full) parts.push(`Ce créneau est ${n.markedFull ? "marqué complet" : "complet"}${NBSP}: ${takenText(n)}.`)
  if (n.closed) parts.push(n.full ? "Ses inscriptions sont aussi fermées." : `Les inscriptions à ce créneau sont fermées${NBSP}: ${takenText(n)}.`)
  return parts.join(" ")
}

type Words = ShiftOverrideNeed & ShiftWords

/**
 * The confirmation, for one shift: the title names the state (« Créneau complet »), the lead says
 * it and asks once (« Ce créneau est complet : 5 places sur 5 sont prises. Ajouter Emma quand
 * même ? »), then « Il y aura 6 personnes pour 5 places. ». Several shifts (a manual add of
 * several): one line each. `verb` « Inscrire » for the button that says so (availability assistant).
 */
export function shiftOverrideWords(via: OverrideVia, name: string, needs: Words[], verb?: "Inscrire"): { title: string; lead: string; lines: string[]; confirmLabel: string } {
  const anyClosed = needs.some((n) => n.closed)
  const anyFull = needs.some((n) => n.full)
  const many = needs.length > 1
  const what = anyFull && anyClosed ? (many ? "complets ou fermés" : "complet ou fermé") : anyFull ? (many ? "complets" : "complet") : (many ? "fermés" : "fermé")
  const title = many ? `${needs.length} créneaux ${what}` : `Créneau ${what}`
  const ask = verb ? `${verb} ${name} quand même${NBSP}?` : VERB[via](name)
  const confirmLabel = verb ? `${verb} quand même` : OVERRIDE_CONFIRM_LABEL[via]
  if (!many) {
    const n = needs[0]
    return { title, lead: `${overrideStateSentence(n)} ${ask}`, lines: [`${spokenShift(n)}.`, afterText(n)], confirmLabel }
  }
  return {
    title,
    lead: `${needs.length} créneaux choisis sont ${what}. ${ask}`,
    lines: needs.map((n) => `${spokenShift(n)}${NBSP}: ${overrideStateText(n)}. ${afterText(n)}`),
    confirmLabel,
  }
}

/** For a dialog already open (accept, restore): the warning box's text. */
export function shiftOverrideWarning(needs: Words[]): string {
  const n = needs[0]
  return `${overrideStateSentence(n)} ${afterText(n)}`
}
