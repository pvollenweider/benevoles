// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
export const NAVIGATION_ORG = "video-navigation-current"
export const NAVIGATION_NAMES = [
  ["Léa", "Morel"], ["Nicolas", "Roux"], ["Zoé", "Martin"], ["Alex", "Dubois"],
  ["Camille", "Rochat"], ["Anna", "Perrin"], ["Julien", "Favre"], ["Sophie", "Giroud"],
  ["Marc", "Berger"], ["Élodie", "Blanc"], ["Thomas", "Meyer"], ["Clara", "Dufour"],
  ["Benoît", "Fontaine"], ["Inès", "Bonnet"], ["Louis", "Chevalier"], ["Emma", "Garnier"],
  ["Hugo", "Lambert"], ["Sarah", "Fournier"], ["Paul", "Vincent"], ["Alice", "Lefèvre"],
  ["Mathieu", "Gauthier"], ["Chloé", "Andre"], ["Samuel", "Caron"], ["Manon", "Leclerc"],
  ["David", "Renard"], ["Lucie", "Schmid"], ["Gabriel", "Vuille"], ["Nina", "Borel"],
  ["Adrien", "Monnier"], ["Louise", "Rey"], ["Raphaël", "Jacquet"], ["Mélanie", "Pilet"],
  ["Olivier", "Besson"], ["Aline", "Grandjean"], ["Étienne", "Mercier"], ["Noémie", "Pasquier"],
  ["Pierre", "Brun"], ["Julie", "Robert"], ["Simon", "Gaillard"], ["Marie", "Simonin"],
] as const
export function assertNavigationMembers(members: Record<string, unknown>[], allowOriginalFour = false) {
  assert(members.length === 40 || (allowOriginalFour && members.length === 4), "Exact navigation classroom required")
  assert.equal(new Set(members.map(member => member.id)).size, members.length)
  for (const member of members) {
    const index = NAVIGATION_NAMES.findIndex((_, index) => member.id === `${NAVIGATION_ORG}-member-${index}`)
    assert(index >= 0, "Unknown navigation member")
    assert.equal(member.organizationId, NAVIGATION_ORG)
    assert.equal(member.firstName, NAVIGATION_NAMES[index][0]); assert.equal(member.lastName, NAVIGATION_NAMES[index][1])
    assert.equal(member.email, `video.navigation.${index}@example.org`)
    assert.equal(member.notes, "Personne fictive de formation.")
    assert.equal(member.active, true)
    assert.deepEqual(member.tags, []); assert.deepEqual(member.availabilityPeriods, [])
    for (const key of ["phone", "birthDate", "availabilityNote", "mergedIntoId", "mergedAt", "erasedAt"]) assert.equal(member[key], null, `Unexpected navigation ${key}`)
  }
}
