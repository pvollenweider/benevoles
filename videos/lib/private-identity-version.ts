// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
export const privateIdentities = {
  delivery: { organizationId: "video-delivery", directory: "videos/output/email-delivery-failures", owner: "Élodie Martin", organizer: "Marc Dupont", members: { pending: "Berger", retrying: "Rochat", recoverable: "Favre", wrong: "Perrin", sent: "Morel" } },
  merge: { organizationId: "video-member-merge", directory: "videos/output/members-duplicates-merge", owner: "Élodie Martin", members: { a: "Favre", b: "Favre" } },
} as const
export type PrivateIdentityScope = keyof typeof privateIdentities
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON ledger read from disk
export function assertPrivateIdentityLedger(scope: PrivateIdentityScope, ledger: Record<string, any>) {
  const fixture = privateIdentities[scope]
  assert.equal(ledger.scope, scope); assert.equal(ledger.version, 2)
  assert.equal(ledger.organizationId, fixture.organizationId)
  assert.deepEqual(ledger.identities, fixture)
  assert.equal(ledger.protectedBeforeSha256, ledger.protectedAfterSha256)
  assert(/^[a-f0-9]{64}$/.test(ledger.protectedBeforeSha256))
  assert.equal(ledger.evidenceFile, "identity-v1-evidence.json")
  assert(typeof ledger.organizationCreatedAt === "string" && Number.isFinite(Date.parse(ledger.organizationCreatedAt)))
  const memberIds = scope === "delivery" ? Object.keys(privateIdentities.delivery.members).map(k => `video-delivery-member-${k}`).sort() : ["video-member-merge-a", "video-member-merge-b"]
  assert(Array.isArray(ledger.changedMemberIds) && ledger.changedMemberIds.length > 0 && ledger.changedMemberIds.every((id: string) => memberIds.includes(id)))
  if (scope === "delivery") assert.deepEqual([...ledger.changedMemberIds].sort(), memberIds)
  else assert(["video-member-merge-a", "video-member-merge-a,video-member-merge-b"].includes([...ledger.changedMemberIds].sort().join(",")))
  assert.deepEqual([...ledger.changedAdminIds].sort(), scope === "delivery" ? ["video-delivery-organizer", "video-delivery-owner"] : ["video-member-merge-owner"])
}
export async function readPrivateIdentityVersion(scope: PrivateIdentityScope) {
  const fixture = privateIdentities[scope]
  const file = path.join(fixture.directory, "identity-version-2.json")
  let bytes: Buffer
  try { bytes = await readFile(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  assert.equal(createHash("sha256").update(bytes).digest("hex"), (await readFile(`${file}.sha256`, "utf8")).trim())
  const ledger = JSON.parse(bytes.toString("utf8"))
  assertPrivateIdentityLedger(scope, ledger)
  assert.equal(ledger.evidenceSha256, createHash("sha256").update(await readFile(path.join(fixture.directory, ledger.evidenceFile))).digest("hex"))
  return ledger
}
