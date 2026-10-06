// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { correctedCsvSha, correctedXlsxSha, ownsImportedNoEmailMember, validateImportBaseline, type ImportPerson, type ImportOwnership } from "../member-import-ownership"
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
})
