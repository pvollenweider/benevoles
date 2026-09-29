import { shiftsOverlap } from "./utils"

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
  shift: ShiftRef
  volunteer: { id: string; firstName: string; lastName: string; email: string | null }
}

/** Short date, e.g. "sam. 1 juin". */
export function fmtShortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}

/** "10:00" → "10h", "10:30" → "10h30". */
export function fmtHour(t: string): string {
  const [h, m] = t.split(":")
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`
}

/** Rows matching the search text (name or email), role filter and shift filter. */
export function filterRegistrations<R extends ListRegistration>(
  registrations: R[],
  filters: { search: string; role: string; shiftId: string },
): R[] {
  const q = filters.search.toLowerCase()
  return registrations.filter((r) => {
    const matchSearch = !q || `${r.volunteer.firstName} ${r.volunteer.lastName} ${r.volunteer.email ?? ""}`.toLowerCase().includes(q)
    const matchRole = !filters.role || r.shift.roleName === filters.role
    const matchShift = !filters.shiftId || r.shift.id === filters.shiftId
    return matchSearch && matchRole && matchShift
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

export function leaderAnnouncement(succeeded: number, failed: number, withoutEmail: number): string {
  return [
    succeeded > 0 ? `${succeeded} ${plural(succeeded, "responsable")} ${plural(succeeded, "ajouté")}.` : null,
    failed > 0 ? `${failed} ${plural(failed, "échec")}.` : null,
    withoutEmail > 0 ? `${withoutEmail} ${plural(withoutEmail, "ignoré")} (pas d'email).` : null,
  ].filter(Boolean).join(" ")
}

export function resendAnnouncement(succeeded: number, failed: number): string {
  const base = `Lien renvoyé à ${succeeded} ${plural(succeeded, "bénévole")}`
  return failed > 0 ? `${base}, ${failed} ${plural(failed, "échec")}.` : `${base}.`
}
