// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { protectedExportIdentityDigest } from "../export-identity-version"
const snapshot = () => ({ members: [{ id: "owned-member", firstName: "Zoé", lastName: "Exemple", updatedAt: "unchanged" }], admins: [{ id: "owned-admin", name: "Élodie Exemple" }], leaders: [{ id: "owned-leader", name: "Nicolas Exemple" }], messages: [{ id: "owned-message", authorName: "Élodie Exemple", subject: "same" }], registrations: [{ id: "owned-registration", charterAcceptedAt: "real", charterAcceptedHash: "hash" }], outbox: [{ id: "owned-outbox", payload: "encrypted-unchanged" }] })
test("approved display identity changes preserve the protected digest", () => {
  const before = snapshot(), after = snapshot()
  after.members[0].lastName = "Perrin"; after.admins[0].name = "Élodie Martin"
  after.leaders[0].name = "Nicolas Berger"; after.messages[0].authorName = "Élodie Martin"
  assert.equal(protectedExportIdentityDigest(before), protectedExportIdentityDigest(after))
})
test("consent, encrypted outbox, timestamp and registration changes cannot pass", () => {
  const before = snapshot()
  for (const change of [(s: ReturnType<typeof snapshot>) => { s.registrations[0].charterAcceptedAt = "invented" }, (s: ReturnType<typeof snapshot>) => { s.outbox[0].payload = "rewritten" }, (s: ReturnType<typeof snapshot>) => { s.members[0].updatedAt = "different" }, (s: ReturnType<typeof snapshot>) => { s.registrations[0].id = "replacement" }]) {
    const after = snapshot(); change(after)
    assert.notEqual(protectedExportIdentityDigest(before), protectedExportIdentityDigest(after))
  }
})
