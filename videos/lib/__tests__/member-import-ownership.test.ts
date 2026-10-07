// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { correctedCsvSha, correctedXlsxSha, correctedCsvShaV2, correctedXlsxShaV2, ownsImportedNoEmailMember, validateImportBaseline, type ImportPerson, type ImportOwnership } from "../member-import-ownership"
import { createSeedProofV2, expectedMemberV2 } from "../member-fixture-v2"
test("no-email import ownership requires exact global ID, all source/default fields and ledger", () => {
  const now = Date.parse("2026-10-06T12:00:00Z")
  const person: ImportPerson = { id: "cimportfixture0001", organizationId: "default", firstName: "René", lastName: "Sansmail", email: null, phone: "+41 79 000 10 03", tags: ["accueil"], active: true, notes: null, birthDate: null, availabilityPeriods: [], availabilityNote: null, createdAt: "2026-10-06T11:59:00Z" }
  const ledger: ImportOwnership = { schemaVersion: 1, scenario: "members-import", csvSha256: correctedCsvSha, xlsxSha256: correctedXlsxSha, provenance: "actual-api-before-after", responseStatus: 200, receipt: { created: 38, updated: 2, skipped: 0, errors: [] }, observedAt: "2026-10-06T12:00:00Z", beforeIds: [...Array.from({ length: 24 }, (_, n) => `before-${n}`), "video-message-sansmail", "video-member-management-2"], beforeCount: 26, afterCount: 64, members: [person, ...Array.from({ length: 37 }, (_, n) => ({ ...person, id: `other-created-${n}`, email: `import.${n}@example.org` }))] }
  ledger.beforeIds[24] = "cmuww4yid000an3a5bttlnq7r"
  assert(ownsImportedNoEmailMember(person, ledger, now))
  assert(!ownsImportedNoEmailMember(person, null, now))
  for (const change of [{ id: "another-person" }, { organizationId: "other" }, { phone: "+41 79 000 10 04" }, { tags: ["other"] }, { notes: "private" }, { active: false }, { availabilityPeriods: ["morning"] }, { createdAt: "2026-10-06T11:58:00Z" }]) assert(!ownsImportedNoEmailMember({ ...person, ...change }, ledger, now))
  assert(!ownsImportedNoEmailMember(person, { ...ledger, csvSha256: "0".repeat(64) }, now))
  assert(!ownsImportedNoEmailMember(person, { ...ledger, beforeIds: [...ledger.beforeIds, person.id] }, now))
  assert(!ownsImportedNoEmailMember(person, { ...ledger, observedAt: "2026-08-01T00:00:00Z" }, now))
  const manualContact = { id: "crecordedcontactnew0001", organizationId: "default", firstName: "René", lastName: "Aubert", email: null, phone: "079 000 90 02", responseStatus: 201, createdAt: "2026-10-06T11:00:00Z" }
  const current: ImportOwnership = { ...ledger, schemaVersion: 2, manualContact, beforeIds: ledger.beforeIds.map(id => id === "cmuww4yid000an3a5bttlnq7r" ? manualContact.id : id) }
  assert(ownsImportedNoEmailMember(person, current, now))
  assert(!ownsImportedNoEmailMember(person, { ...current, manualContact: undefined }, now))
  for (const change of [{ id: "unrecorded-contact" }, { responseStatus: 200 }, { organizationId: "other" }, { email: "real@example.org" }, { phone: "0790009003" }, { lastName: "Unknown" }, { createdAt: "2026-08-01T00:00:00Z" }]) {
    assert(!ownsImportedNoEmailMember(person, { ...current, manualContact: { ...manualContact, ...change } }, now))
  }
  const seedProof = createSeedProofV2(Array.from({ length: 36 }, (_, index) => ({ ...expectedMemberV2(index), createdAt: "2026-10-06T11:00:00Z" })), "actual-seed-write", new Date(now).toISOString())
  const natural = { ...person, lastName: "Meyer" }
  const v2: ImportOwnership = { ...current, schemaVersion: 3, seedProof, csvSha256: correctedCsvShaV2, xlsxSha256: correctedXlsxShaV2, members: current.members.map(value => value.id === person.id ? natural : value) }
  assert(ownsImportedNoEmailMember(natural, v2, now))
  assert(!ownsImportedNoEmailMember(person, v2, now))
  assert(!ownsImportedNoEmailMember(natural, { ...v2, seedProof: { ...seedProof, sha256: "0".repeat(64) } }, now))
  assert(!ownsImportedNoEmailMember(natural, { ...v2, csvSha256: correctedCsvSha }, now))
  assert(!ownsImportedNoEmailMember(natural, { ...v2, manualContact: { ...manualContact, responseStatus: 200 } }, now))
})
test("baseline permits only 24 email fixtures and both exact persistent no-email seeds", () => {
  const defaults: ImportPerson = { id: "cmuww4yid000an3a5bttlnq7r", organizationId: "default", firstName: "René", lastName: "Aubert", email: null, phone: "079 000 90 02", tags: [], active: true, notes: null, birthDate: null, availabilityPeriods: [], availabilityNote: null, createdAt: "2026-10-01T12:00:00Z" }
  const evidence = [{ ...defaults, organizationId: "default", createdAt: "2026-10-01T12:00:00Z", responseStatus: 201 }]
  const management = { ...defaults, id: "video-member-management-2", lastName: "Sansmail", phone: "079 000 02 00", tags: ["accueil"], notes: "Contact à joindre par téléphone pour les horaires.", availabilityPeriods: ["evening"] }
  const people = [...Array.from({ length: 24 }, (_, n) => ({ ...defaults, id: `seed-${n}`, email: `seed.${n}@example.org` })), defaults, management]
  validateImportBaseline(people, evidence)
  validateImportBaseline([...people.slice(0, 25), { ...management, firstName: "Sébastien", lastName: "Morel 3", tags: ["logistique", "permis-b"] }], evidence)
  for (const change of [{ id: "unknown-null-seed" }, { notes: null }, { phone: "0790000200" }, { tags: [] }, { availabilityPeriods: [] }, { active: false }, { birthDate: "2000-01-01" }, { firstName: "Unknown" }]) assert.throws(() => validateImportBaseline([...people.slice(0, 25), { ...management, ...change }], evidence))
  assert.throws(() => validateImportBaseline(people, []))
  assert.throws(() => validateImportBaseline(people.slice(0, 24), evidence))
  assert.throws(() => validateImportBaseline([...people, { ...defaults, id: "extra" }], evidence))
  const replacement = { ...defaults, id: "crecordedcontactnew0001" }
  const nextPeople = people.map(person => person.id === defaults.id ? replacement : person)
  const nextEvidence = [{ ...evidence[0], id: replacement.id }]
  assert.equal(validateImportBaseline(nextPeople, nextEvidence).id, replacement.id)
  assert.throws(() => validateImportBaseline(nextPeople, evidence))
  assert.throws(() => validateImportBaseline(nextPeople.map(person => person.id === replacement.id ? { ...person, notes: "private" } : person), nextEvidence))
  const naturalSeeds = Array.from({ length: 36 }, (_, index) => ({ ...expectedMemberV2(index), createdAt: defaults.createdAt }))
  const proof = createSeedProofV2(naturalSeeds, "actual-seed-write", new Date().toISOString())
  const naturalBaseline = [...people.slice(0, 25), naturalSeeds[2]]
  validateImportBaseline(naturalBaseline, evidence, Date.now(), proof)
  assert.throws(() => validateImportBaseline(naturalBaseline, evidence))
  assert.throws(() => validateImportBaseline(naturalBaseline, evidence, Date.now(), { ...proof, sha256: "0".repeat(64) }))
  assert.throws(() => validateImportBaseline([...naturalBaseline.slice(0, 25), { ...naturalSeeds[2], notes: "Private" }], evidence, Date.now(), proof))
})
