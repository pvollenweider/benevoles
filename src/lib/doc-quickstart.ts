// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { DOC_ROLE_GROUP_ORDER, docUnitsByGroup, type DocUnit } from "@/lib/doc-units"

/**
 * The quickstart unit (#758), « Créer son premier événement »: one page that takes a new organiser,
 * in order, from an empty organisation to a shared sign-up link, each step linking to the unit
 * that details it. Its source is `guide/creer-son-premier-evenement.md`; the documentation's index
 * (/doc), the organisers' guide and the home page point to it by this slug.
 */
export const DOC_QUICKSTART_SLUG = "creer-son-premier-evenement"

/** The quickstart unit, or null if it was removed (the links to it are then left out). */
export function docQuickstartUnit(units: readonly DocUnit[]): DocUnit | null {
  return units.find((u) => u.slug === DOC_QUICKSTART_SLUG) ?? null
}

/**
 * The first unit an organiser meets on their guide (/doc/admin): the first unit of the first group
 * of the organisers' order. A test checks it is the quickstart.
 */
export function firstOrganiserDocUnit(units: readonly DocUnit[]): DocUnit | null {
  const groups = docUnitsByGroup(units, "admin")
  const first = groups.find((g) => g.group.id === DOC_ROLE_GROUP_ORDER.admin[0])
  return first?.units[0] ?? null
}
