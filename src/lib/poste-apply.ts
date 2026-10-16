// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Appliquer au poste » from the Frise popover (#1017): the places, the minimum and the label of one
 * shift copied onto the poste's other live shifts, on this day or over the whole event. Shared by the
 * popover (counts, what the button applies, the result) and the route (which shifts it writes).
 * No Prisma here: the popover imports it.
 */

/** « ce jour » (the shift's day) or « tout l'événement » (every day where the poste has shifts). */
export type ApplyScope = "day" | "event"

type ScopedShift = { roleName: string; date: string; status: string }

/** The poste's live shifts the action writes: on `date` only for « ce jour », else all of them. */
export function posteApplyTargets<S extends ScopedShift>(shifts: S[], roleName: string, scope: ApplyScope, date: string): S[] {
  return shifts.filter((s) => s.roleName === roleName && s.status !== "cancelled" && (scope === "event" || s.date === date))
}

/** How many shifts and days a scope covers, said before applying it to the whole event. */
export function posteApplyCount(shifts: ScopedShift[]): { shifts: number; days: number } {
  return { shifts: shifts.length, days: new Set(shifts.map((s) => s.date)).size }
}

/** Whether the poste has shifts on other days than `date`: else one button is enough. */
export function posteSpansOtherDays(shifts: ScopedShift[], roleName: string, date: string): boolean {
  return posteApplyTargets(shifts, roleName, "event", date).some((s) => s.date !== date)
}

/**
 * The label to copy, or undefined to leave every shift's own: only a label typed in this popover
 * (changed since it opened) and not empty. An emptied label means « the poste's name » for this
 * shift only; it never wipes the others' labels.
 */
export function labelToApply(typed: string, atOpening: string, roleName: string): string | undefined {
  const label = typed.trim()
  if (!label || label === roleName || label === atOpening.trim()) return undefined
  return label
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** What the action copies, as sent: `minVolunteers` undefined keeps each shift's own, null removes it. */
export type ApplyValues = { capacity: number; minVolunteers?: number | null; label?: string }

/** The sentence under the buttons: what is applied, and what each shift keeps. */
export function applySummary(v: ApplyValues): string {
  const applied = [plural(v.capacity, "place", "places")]
  const kept: string[] = []
  if (v.minVolunteers === undefined) kept.push("son minimum")
  else applied.push(v.minVolunteers === null ? "aucun minimum" : `un minimum de ${v.minVolunteers}`)
  if (v.label === undefined) kept.push("son libellé")
  else applied.push(`le libellé « ${v.label} »`)
  const list = (items: string[]) => items.length > 1 ? `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}` : items[0]
  return `Applique ${list(applied)}.${kept.length ? ` Chaque créneau garde ${list(kept)}.` : ""} Jamais moins de places que d'inscrits sur un créneau.`
}

/** The question asked before applying to the whole event. */
export function confirmQuestion(count: { shifts: number; days: number }): string {
  return `Appliquer à ${plural(count.shifts, "créneau", "créneaux")} sur ${plural(count.days, "jour", "jours")} ?`
}

/** What the route answers after applying (#1017): shifts and days covered, shifts kept above the places. */
export type ApplyResult = { shifts: number; days: number; keptHigher: number }

/** The result said in the popover once applied. */
export function applyResultMessage(roleName: string, scope: ApplyScope, r: ApplyResult): string {
  const where = scope === "day" ? " ce jour" : r.days > 1 ? ` sur ${r.days} jours` : ""
  const head = `Appliqué à ${plural(r.shifts, "créneau", "créneaux")} du poste « ${roleName} »${where}.`
  if (r.keptHigher === 0) return head
  return `${head} ${r.keptHigher > 1 ? `${r.keptHigher} créneaux gardent` : "1 créneau garde"} plus de places : déjà plus d'inscrits.`
}

/** The shifts whose label changes: the label differs from theirs. */
export function labelUpdates(shifts: { id: string; label: string }[], label: string | undefined): { id: string; label: string }[] {
  if (label === undefined) return []
  return shifts.filter((s) => s.label !== label).map((s) => ({ id: s.id, label }))
}
