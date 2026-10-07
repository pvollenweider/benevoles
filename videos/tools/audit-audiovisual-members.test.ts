// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { validateMemberReviewFixture } from "./audit-audiovisual"
import { createSeedProofV2, expectedMemberV2 } from "../lib/member-fixture-v2"
const now = Date.parse("2026-10-06T12:00:00Z")
const url = "postgresql://demo:demo@localhost:45433/benevoles_video"
const member = { id: "fixture-person", organizationId: "default", firstName: "Camille", lastName: "Exemple", email: "camille@example.org", phone: null }
const fixture = { id: "default", name: "Fêtes de Montvert", volunteers: [member], admins: [{ email: "org-admin@localhost" }], events: [{ slug: "fete-du-village", sectorLeaders: [{ email: "leader@example.org" }], registrations: [{ volunteer: member }] }] }
test("member review rejects remote DB, wrong port/path/org and unrelated displayable contacts", () => {
  validateMemberReviewFixture(url, fixture, [], now)
  for (const badUrl of ["postgresql://demo:demo@remote:45433/benevoles_video", "postgresql://demo:demo@localhost:5432/benevoles_video", "postgresql://demo:demo@localhost:45433/benevoles_video_other"]) assert.throws(() => validateMemberReviewFixture(badUrl, fixture, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, id: "another" }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...member, email: "real@gmail.com" }] }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...member, email: null }] }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, admins: [{ email: "owner@gmail.com" }] }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, events: [{ ...fixture.events[0], sectorLeaders: [{ email: "leader@gmail.com" }] }] }, [], now))
})
test("only exact no-email seeds or recent exact 201-owned René are accepted", () => {
  const withoutEmail = { ...member, id: "video-message-sansmail", firstName: "René", lastName: "Sansmail", email: null }
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [withoutEmail] }, [], now))
  const secondSeed = { ...withoutEmail, id: "video-member-management-2", firstName: "Sébastien", lastName: "Morel 3", phone: "079 000 02 00" }
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [secondSeed] }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...secondSeed, firstName: "René", lastName: "Sansmail" }] }, [], now))
  const v2members = Array.from({ length: 36 }, (_, index) => ({ ...expectedMemberV2(index), createdAt: "2026-10-06T11:00:00Z" }))
  const v2proof = createSeedProofV2(v2members, "actual-seed-write", new Date(now).toISOString())
  validateMemberReviewFixture(url, { ...fixture, volunteers: [v2members[2]] }, [], now, null, v2proof)
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [v2members[2]] }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...secondSeed, phone: "079 000 03 00" }] }, [], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...withoutEmail, id: "unknown-sansmail" }] }, [], now))
  const recorded = { ...withoutEmail, id: "cmemberfixture0001", lastName: "Aubert", phone: "079 000 90 02" }
  const proof = { ...recorded, responseStatus: 201, createdAt: "2026-10-06T11:59:00Z" }
  validateMemberReviewFixture(url, { ...fixture, volunteers: [recorded] }, [proof], now)
  for (const changes of [{ responseStatus: 200 }, { createdAt: "2026-08-01T00:00:00Z" }, { createdAt: "2026-10-07T00:00:00Z" }]) assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [recorded] }, [{ ...proof, ...changes }], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...recorded, phone: "0790009003" }] }, [proof], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...recorded, createdAt: "2026-10-06T11:55:00Z" }] }, [{ ...proof, actualCreatedAt: "2026-10-06T11:59:00Z" }], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, volunteers: [{ ...recorded, notes: "private" }] }, [proof], now))
  assert.throws(() => validateMemberReviewFixture(url, { ...fixture, events: [{ ...fixture.events[0], registrations: [{ volunteer: { ...member, email: null } }] }] }, [], now))
})
