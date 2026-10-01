// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fold } from "./text-fold"

import { shiftsOverlap } from "./utils"
import { clockTime } from "./gantt-utils"

/**
 * Pure logic of the admin registrations list (RegistrationsManager, #291): filtering, conflicts
 * when adding someone by hand, and the messages announced after a bulk action. Kept out of the
 * component so it can be tested on its own.
 */

export type ShiftRef = {
  id: string; roleName: string; label: string; date: string
  startTime: string; endTime: string; capacity: number; registrationCount: number
}

type ListRegistration = {
  status?: string
  shift: ShiftRef
  volunteer: { id: string; firstName: string; lastName: string; email: string | null }
}

/** Short date, e.g. "sam. 1 juin". */
export function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}

/** "10:00" → "10h", "10:30" → "10h30"; legacy "25:30" → "1h30" (modulo 24). */
export function fmtHour(t: string): string {
  const [h, m] = clockTime(t).split(":")
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`
}

/** Rows matching the search text (name or email), role filter and shift filter. */
export function filterRegistrations<R extends ListRegistration>(
  registrations: R[],
  filters: { search: string; role: string; shiftId: string; requestsOnly?: boolean },
): R[] {
  const q = fold(filters.search)
  return registrations.filter((r) => {
    // Accents and case aside (#390): « zoe » finds Zoé.
    const matchSearch = !q || fold(`${r.volunteer.firstName} ${r.volunteer.lastName} ${r.volunteer.email ?? ""}`).includes(q)
    const matchRole = !filters.role || r.shift.roleName === filters.role
    const matchShift = !filters.shiftId || r.shift.id === filters.shiftId
    // « Demandes à traiter » (#484): only requests waiting for a decision.
    const matchStatus = !filters.requestsOnly || r.status === "requested"
    return matchSearch && matchRole && matchShift && matchStatus
  })
}

/** Shifts already held by the volunteer with this email (add form), or undefined if none. */
export function shiftsOfEmail(registrations: ListRegistration[], email: string): ShiftRef[] | undefined {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return undefined
  const found = registrations.filter((r) => r.volunteer.email?.toLowerCase() === normalized).map((r) => r.shift)
  return found.length > 0 ? found : undefined
}

/** Why the selected shift can't be added for that volunteer, or null. */
export function addConflictMessage(selected: ShiftRef | null, volunteerShifts: ShiftRef[] | undefined): string | null {
  if (!selected || !volunteerShifts) return null
  if (volunteerShifts.some((e) => e.id === selected.id)) return "Ce bénévole est déjà inscrit à ce créneau."
  if (volunteerShifts.some((e) => shiftsOverlap(selected, e))) return "Ce bénévole est déjà inscrit à un autre créneau pour cette plage horaire."
  return null
}

/** Shifts (not already held) that overlap one of `existing`. */
export function overlappingShiftIds(shifts: ShiftRef[], existing: ShiftRef[] | undefined): Set<string> {
  if (!existing) return new Set()
  const held = new Set(existing.map((s) => s.id))
  return new Set(shifts.filter((s) => !held.has(s.id) && existing.some((e) => shiftsOverlap(s, e))).map((s) => s.id))
}

/** Roles a volunteer is registered on, to offer when making them sector leader. */
export function leaderRoleOptions(registrations: ListRegistration[], volunteerId: string): string[] {
  return [...new Set(registrations.filter((r) => r.volunteer.id === volunteerId).map((r) => r.shift.roleName))]
}

const plural = (n: number, word: string) => `${word}${n > 1 ? "s" : ""}`

export function cancelAnnouncement(done: number, failed: number): string {
  const base = `${done} ${plural(done, "bénévole")} ${plural(done, "retiré")}`
  return failed > 0 ? `${base}, ${failed} ${plural(failed, "échec")}.` : `${base}.`
}

/** Rows taken out of the list, with the seconds left to change one's mind (#379). */
export function heldAnnouncement(count: number, seconds: number): string {
  return `${count} ${plural(count, "bénévole")} ${count > 1 ? "seront retirés" : "sera retiré"} dans ${seconds} secondes. « Annuler le retrait » pour ${count > 1 ? "les" : "le"} garder.`
}

export function undoneAnnouncement(count: number): string {
  return `Retrait annulé : ${count > 1 ? `les ${count} bénévoles restent inscrits` : "le bénévole reste inscrit"}, aucun email envoyé.`
}

export function leaderAnnouncement(succeeded: number, failed: number, withoutEmail: number): string {
  return [
    succeeded > 0 ? `${succeeded} ${plural(succeeded, "responsable")} ${plural(succeeded, "ajouté")}.` : null,
    failed > 0 ? `${failed} ${plural(failed, "échec")}.` : null,
    withoutEmail > 0 ? `${withoutEmail} ${plural(withoutEmail, "ignoré")} (pas d'email).` : null,
  ].filter(Boolean).join(" ")
}

/**
 * A registration the organizer just added by hand, e.g. « Inscription de Chloé Roy ajoutée : Bar,
 * Soir, sam. 4 juil., de 18h30 à 20h. ». « ajoutée » agrees with « inscription », so the sentence
 * needs no « ·e », and commas replace the middle dot, which screen readers read aloud (#574).
 */
export function manualAddAnnouncement(person: string, shift: Pick<ShiftRef, "roleName" | "label" | "date" | "startTime" | "endTime">): string {
  const name = shift.label !== shift.roleName ? `${shift.roleName}, ${shift.label}` : shift.roleName
  return `Inscription de ${person} ajoutée : ${name}, ${fmtShortDate(shift.date)}, de ${fmtHour(shift.startTime)} à ${fmtHour(shift.endTime)}.`
}

/** A volunteer just made sector leader of a role (« responsable » is the same for everyone). */
export function leaderDesignatedAnnouncement(name: string, role: string): string {
  return `${name} est maintenant responsable de « ${role} », invitation envoyée par email.`
}

/** A sector leader just removed from a role, without « ·e ». */
export function leaderRemovedAnnouncement(name: string, role: string): string {
  return `${name} n'est plus responsable de « ${role} ».`
}

/** How many registrations the filters leave on the list, e.g. « 2 inscriptions affichées ». */
export function listCountAnnouncement(count: number): string {
  return `${count} ${plural(count, "inscription")} ${plural(count, "affichée")}`
}

export function resendAnnouncement(succeeded: number, failed: number): string {
  const base = `Lien renvoyé à ${succeeded} ${plural(succeeded, "bénévole")}`
  return failed > 0 ? `${base}, ${failed} ${plural(failed, "échec")}.` : `${base}.`
}
