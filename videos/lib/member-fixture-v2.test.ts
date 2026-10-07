// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { createSeedProofV2, expectedMemberV2, exactLegacyM2ForMigration, ownsNaturalMemberSeed, validateSeedProofV2 } from "./member-fixture-v2"
const now = Date.parse("2026-10-06T18:00:00Z")
const members = Array.from({ length: 36 }, (_, index) => ({ ...expectedMemberV2(index), createdAt: "2026-10-06T17:00:00Z" }))
test("natural fixture requires exact identities, all fields, dates and hashed actual proof", () => {
  const proof = createSeedProofV2(members, "actual-seed-write", new Date(now).toISOString())
  assert(ownsNaturalMemberSeed(members[2], proof, now))
  for (const mutation of [{ id: "video-member-management-02" }, { organizationId: "private" }, { lastName: "Morel 3" }, { notes: "Private detail" }, { createdAt: "2026-10-06T17:01:00Z" }, { phone: "0790000200" }, { tags: [] }]) assert(!ownsNaturalMemberSeed({ ...members[2], ...mutation }, proof, now))
  assert(!ownsNaturalMemberSeed(members[2], { ...proof, sha256: "0".repeat(64) }, now))
  assert.throws(() => createSeedProofV2(members.slice(1), "actual-seed-write", new Date(now).toISOString()))
  assert.throws(() => validateSeedProofV2({ ...proof, observedAt: "2026-10-07T18:00:00Z" }, now))
  assert.throws(() => createSeedProofV2(members.map((member, index) => index === 2 ? { ...member, email: "real@example.com" } : member), "exact-v1-migration", new Date(now).toISOString()))
})
test("legacy migration permits only the exact known M2 seed, not altered personal fields", () => {
  const previous = { ...expectedMemberV2(2), lastName: "Morel 3", createdAt: "2026-10-06T17:00:00Z" }
  assert(exactLegacyM2ForMigration(previous))
  const invitation = { ...expectedMemberV2(2, true), lastName: "Sansmail", createdAt: previous.createdAt }
  assert(exactLegacyM2ForMigration(invitation))
  for (const mutation of [{ id: "private" }, { organizationId: "private" }, { birthDate: "1990-01-01" }, { notes: "Changed" }, { active: false }, { createdAt: "invalid" }, { availabilityNote: "Private" }, { tags: [] }]) assert(!exactLegacyM2ForMigration({ ...previous, ...mutation }))
  const proof = createSeedProofV2(members, "actual-seed-write", new Date(now).toISOString())
  assert(!ownsNaturalMemberSeed(previous, proof, now), "Old identity must never become a v2 capture through a proof flag")
})
