// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Repas sur le pouce possible » (#1171, lot 2) is a per-shift setting; the poste panel shows and
 * sets it for all of a poste's live shifts at once. Pure (the panel and its tests read it).
 */

/** The value across a poste's live shifts: on all, on none, or on some only. */
export type PosteMealOnTheGo = "all" | "none" | "some"

export function posteMealOnTheGo(shifts: { roleName: string; status?: string; mealOnTheGo?: boolean | null }[], roleName: string): PosteMealOnTheGo {
  const own = shifts.filter((s) => s.roleName === roleName && s.status !== "cancelled")
  const on = own.filter((s) => !!s.mealOnTheGo).length
  return on === 0 ? "none" : on === own.length ? "all" : "some"
}

/** The panel's button text, and its accessible name. */
export function posteMealOnTheGoLabel(value: PosteMealOnTheGo, role: string): { text: string; name: string } {
  const text = value === "all" ? "Repas : sur le pouce" : value === "some" ? "Repas : sur certains créneaux" : "Repas : non"
  // The visible text first, then the poste (Label in Name), like the panel's other buttons.
  const name = value === "all"
    ? `${text}, poste « ${role} », possible sur tous ses créneaux`
    : value === "some"
      ? `${text}, poste « ${role} », repas sur le pouce possible`
      : `${text}, poste « ${role} » sans repas sur le pouce`
  return { text, name }
}

/** Announced once saved. */
export function mealOnTheGoAnnouncement(role: string, on: boolean): string {
  return on
    ? `Poste « ${role} » : repas sur le pouce possible sur tous ses créneaux.`
    : `Poste « ${role} » : repas sur le pouce retiré de tous ses créneaux.`
}
