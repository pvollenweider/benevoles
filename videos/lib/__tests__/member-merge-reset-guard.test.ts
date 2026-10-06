import { test } from "vitest"
import assert from "node:assert/strict"
import { mergeOwnedSchema, mergeOwnedSchemaSha256, validateMergeOwnershipLedger, type MergeOwnershipLedger } from "../member-merge-reset-guard"
import { mergeFixturePhone } from "../member-merge-fixture"

const generation = "2026-10-06T12:00:00.000Z"
const ledger = (): MergeOwnershipLedger => ({ schemaVersion: 1, scenario: "members-duplicates-merge", organizationId: "video-member-merge", organizationCreatedAt: generation, preparedAt: generation, fixtureSchemaSha256: mergeOwnedSchemaSha256, owned: structuredClone(mergeOwnedSchema) })
test("reset ledger binds exact IDs, schema and fixture generation", () => {
  validateMergeOwnershipLedger(ledger(), generation)
  assert.throws(() => validateMergeOwnershipLedger({ ...ledger(), fixtureSchemaSha256: "0".repeat(64) }, generation))
  assert.throws(() => validateMergeOwnershipLedger(ledger(), "2026-10-07T12:00:00.000Z"))
  const bad = ledger(); (bad.owned.memberIds as unknown as string[])[0] = "default-person"
  assert.throws(() => validateMergeOwnershipLedger(bad, generation))
})
test("phone normalization accepts only the two fictional Swiss phone numbers", () => {
  assert.equal(mergeFixturePhone("+41 79 000 01 01"), "0790000101")
  assert.equal(mergeFixturePhone("0790000100"), "0790000100")
  assert.equal(mergeFixturePhone("0790000199"), null)
})
