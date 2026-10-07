// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { assertPrivateIdentityLedger, privateIdentities } from "../private-identity-version"
const ledger = () => ({ scope: "merge", version: 2, organizationId: "video-member-merge", identities: privateIdentities.merge, protectedBeforeSha256: "a".repeat(64), protectedAfterSha256: "a".repeat(64), evidenceFile: "identity-v1-evidence.json", organizationCreatedAt: "2026-10-06T00:00:00Z", changedMemberIds: ["video-member-merge-a"], changedAdminIds: ["video-member-merge-owner"] })
test("post-merge identity ledger keeps the erased member untouched", () => assertPrivateIdentityLedger("merge", ledger()))
test("unrelated identities or protected mutations are rejected", () => {
  for (const delta of [{ organizationId: "default" }, { changedMemberIds: ["foreign-member"] }, { changedAdminIds: ["default-admin"] }, { protectedAfterSha256: "b".repeat(64) }]) assert.throws(() => assertPrivateIdentityLedger("merge", { ...ledger(), ...delta }))
})
test("delivery ledger requires all five exact members, never a partial arbitrary selection", () => {
  const delivery = { ...ledger(), scope: "delivery", organizationId: "video-delivery", identities: privateIdentities.delivery, changedAdminIds: ["video-delivery-owner", "video-delivery-organizer"], changedMemberIds: Object.keys(privateIdentities.delivery.members).map(k => `video-delivery-member-${k}`) }
  assertPrivateIdentityLedger("delivery", delivery)
  assert.throws(() => assertPrivateIdentityLedger("delivery", { ...delivery, changedMemberIds: delivery.changedMemberIds.slice(1) }))
})
