// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Optional limit of shifts per volunteer for a role (#466), e.g. « Loge des artistes : 2 créneaux
 * par personne », so a popular role is shared. Stored on every shift of the role, like its colour.
 *
 * What counts: every live registration of the volunteer on the role (confirmed, offered or on the
 * waitlist), plus the new ones asked for. Counting waitlist entries keeps the rule simple and
 * means a later offer can never push someone over the limit. Cancelled ones don't count.
 * The server checks it under the volunteer's row lock; the public page checks it too, as a courtesy.
 */

export type RoleLimitBreach = { roleName: string; max: number; held: number; asked: number }

/**
 * The limit of each role, from all its shifts on the event: they normally share one value, and a
 * shift created without it (or before it was set) must not open a way around it. The smallest wins.
 */
export function roleLimits(shifts: { roleName: string; maxPerVolunteer?: number | null }[]): Map<string, number> {
  const limits = new Map<string, number>()
  for (const s of shifts) {
    if (s.maxPerVolunteer == null || s.maxPerVolunteer < 1) continue
    const current = limits.get(s.roleName)
    if (current === undefined || s.maxPerVolunteer < current) limits.set(s.roleName, s.maxPerVolunteer)
  }
  return limits
}

/** Roles whose limit the new shifts would exceed, given the shifts the volunteer already holds. */
export function roleLimitBreaches(asked: { roleName: string }[], held: { roleName: string }[], limits: Map<string, number>): RoleLimitBreach[] {
  const breaches: RoleLimitBreach[] = []
  for (const roleName of new Set(asked.map((s) => s.roleName))) {
    const max = limits.get(roleName)
    if (max === undefined) continue
    const heldCount = held.filter((h) => h.roleName === roleName).length
    const askedCount = asked.filter((s) => s.roleName === roleName).length
    if (heldCount + askedCount > max) breaches.push({ roleName, max, held: heldCount, asked: askedCount })
  }
  return breaches
}

const shiftsWord = (n: number) => `${n} créneau${n > 1 ? "x" : ""}`

/** What the volunteer reads; the same sentence from the page and from the server. */
export function roleLimitMessage(b: RoleLimitBreach): string {
  if (b.held >= b.max) return `Vous avez déjà ${shiftsWord(b.held)} « ${b.roleName} », le maximum pour ce poste.`
  if (b.held === 0) return `Au plus ${shiftsWord(b.max)} « ${b.roleName} » par personne : vous en avez choisi ${b.asked}, retirez-en ${b.asked - b.max}.`
  return `Au plus ${shiftsWord(b.max)} « ${b.roleName} » par personne : vous en avez déjà ${b.held}, vous pouvez en ajouter ${b.max - b.held}.`
}

/** On the public page, when one more shift of the role is refused at selection. */
export function roleLimitSelectionMessage(b: RoleLimitBreach): string {
  return `Au plus ${shiftsWord(b.max)} « ${b.roleName} » par personne : ce créneau n'est pas ajouté.`
}

/** The organiser's warning before exceeding it by hand. */
export function roleLimitAdminMessage(b: RoleLimitBreach, name: string): string {
  return `${name} a déjà ${shiftsWord(b.held)} « ${b.roleName} », pour un maximum de ${b.max} par personne.`
}

export class RoleLimitError extends Error {
  constructor(readonly breach: RoleLimitBreach) {
    super(`Role limit reached for ${breach.roleName}`)
  }
}
