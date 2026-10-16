// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "vitest"
import { createSeedProofV2, expectedMemberV2, exactLegacyM2ForMigration, ownsNaturalMemberSeed, validateSeedProofV2 } from "./member-fixture-v2"
import { findDuplicatePairs } from "../../src/lib/member-duplicates"
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
  assert(exactLegacyM2ForMigration(members[2]))
  assert(!exactLegacyM2ForMigration({ ...members[2], notes: "Changed" }))
  const invitation = { ...expectedMemberV2(2, true), lastName: "Sansmail", createdAt: previous.createdAt }
  assert(exactLegacyM2ForMigration(invitation))
  for (const mutation of [{ id: "private" }, { organizationId: "private" }, { birthDate: "1990-01-01" }, { notes: "Changed" }, { active: false }, { createdAt: "invalid" }, { availabilityNote: "Private" }, { tags: [] }]) assert(!exactLegacyM2ForMigration({ ...previous, ...mutation }))
  const proof = createSeedProofV2(members, "actual-seed-write", new Date(now).toISOString())
  assert(!ownsNaturalMemberSeed(previous, proof, now), "Old identity must never become a v2 capture through a proof flag")
})
test("natural fixture uses distinct prénom.nom addresses and suggests only the homonym pair (#1037)", () => {
  for (const invitation of [false, true]) {
    const seeded = Array.from({ length: 36 }, (_, index) => expectedMemberV2(index, invitation))
    const emails = seeded.map(member => member.email)
    assert.equal(emails[2], null)
    const present = emails.filter((email): email is string => email !== null)
    assert.equal(present.length, 35)
    assert.equal(new Set(present).size, 35)
    for (const email of present) assert.match(email, /^[a-z]+\.[a-z]+@example\.org$/)
    assert(!present.some(email => /\d/.test(email)), "Numbered addresses made every pair look like a typo")
    const pairs = findDuplicatePairs(seeded.map(member => ({ ...member, birthDate: null, addressToVerify: false, mergedIntoId: null })))
    assert.deepEqual(pairs.map(pair => [pair.memberIdA, pair.memberIdB, pair.signals]), [["video-member-management-0", "video-member-management-1", ["name"]]])
  }
})

test("pre-1039 hashed receipt authorizes only unchanged M2 during guarded reset", () => {
  const old = members.map((member, index) => ({ ...member, email: index === 2 ? null : `video.membre.${index}@example.org`, lastName: index === 23 ? "Dutoit" : index === 30 ? "Gautier" : member.lastName }))
  const payload = { schemaVersion: 2 as const, scenario: "natural-member-seeds" as const, provenance: "actual-seed-write" as const, observedAt: new Date(now).toISOString(), members: old }
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)).digest("hex")
  const proof = { ...payload, sha256: hash(payload) }
  assert(ownsNaturalMemberSeed(old[2], proof, now))
  assert(!ownsNaturalMemberSeed(old[0], proof, now))
  assert.throws(() => createSeedProofV2(old, "actual-seed-write", payload.observedAt))
  const changed = { ...payload, members: old.map((member, index) => index === 2 ? { ...member, notes: "Changed" } : member) }
  assert.throws(() => validateSeedProofV2({ ...changed, sha256: hash(changed) }, now))
  assert.throws(() => validateSeedProofV2({ ...proof, sha256: "0".repeat(64) }, now))
})
