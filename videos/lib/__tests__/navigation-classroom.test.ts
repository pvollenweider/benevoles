// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { NAVIGATION_NAMES, NAVIGATION_ORG, assertNavigationMembers } from "../navigation-classroom"
const members = () => NAVIGATION_NAMES.map(([firstName, lastName], index) => ({ id: `${NAVIGATION_ORG}-member-${index}`, organizationId: NAVIGATION_ORG, firstName, lastName, email: `video.navigation.${index}@example.org`, notes: "Personne fictive de formation.", active: true, phone: null, birthDate: null, tags: [], availabilityPeriods: [], availabilityNote: null, mergedIntoId: null, mergedAt: null, erasedAt: null }))
test("only the exact forty natural-name classroom is reviewable", () => {
  assertNavigationMembers(members())
  assert.throws(() => assertNavigationMembers(members().slice(0, 4)))
  assertNavigationMembers(members().slice(0, 4), true)
})
test("rejects unknown identities, other organizations and private fields", () => {
  for (const patch of [{ id: "unknown" }, { organizationId: "default" }, { lastName: "Exemple" }, { phone: "079 123 45 67" }, { tags: ["private"] }, { availabilityNote: "private" }]) {
    const rows: Record<string, unknown>[] = members(); rows[0] = { ...rows[0], ...patch }
    assert.throws(() => assertNavigationMembers(rows))
  }
})
