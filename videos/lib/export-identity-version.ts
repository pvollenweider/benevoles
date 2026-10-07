// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
export const exportIdentityV2 = { lastNames: ["Rochat", "Favre", "Perrin", "Morel"], owner: "Élodie Martin", leader: "Nicolas Berger" } as const
export const exportIdentityFile = "identity-version-2.json"
export async function exportIdentityVersion(directory = "videos/output/data-exports-archives") {
  let bytes: Buffer
  try { bytes = await readFile(path.join(directory, exportIdentityFile)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
  assert.equal(createHash("sha256").update(bytes).digest("hex"), (await readFile(path.join(directory, `${exportIdentityFile}.sha256`), "utf8")).trim())
  const ledger = JSON.parse(bytes.toString("utf8"))
  assert.equal(ledger.organizationId, "video-data-exports"); assert.equal(ledger.version, 2)
  assert.deepEqual(ledger.identities, exportIdentityV2)
  assert.equal(ledger.protectedBeforeSha256, ledger.protectedAfterSha256)
  assert(/^[a-f0-9]{64}$/.test(ledger.protectedBeforeSha256))
  assert.deepEqual(ledger.memberIds, [0, 1, 2, 3].map(i => `video-data-exports-member-${i}`))
  assert.equal(ledger.actionSha256, createHash("sha256").update(await readFile(path.join(directory, "fourteen-column-actions.json"))).digest("hex"), "Original consent/delivery ledger changed after identity migration")
  return ledger
}

/** Only identity display fields may differ. All other fixture bytes remain protected. */
export function protectedExportIdentityDigest(snapshot: { members: Record<string, unknown>[]; admins: Record<string, unknown>[]; leaders: Record<string, unknown>[]; messages: Record<string, unknown>[]; [key: string]: unknown }) {
  const clean = { ...snapshot,
    members: snapshot.members.map(({ lastName: _, ...rest }) => rest),
    admins: snapshot.admins.map(({ name: _, ...rest }) => rest),
    leaders: snapshot.leaders.map(({ name: _, ...rest }) => rest),
    messages: snapshot.messages.map(({ authorName: _, ...rest }) => rest),
  }
  return createHash("sha256").update(JSON.stringify(clean)).digest("hex")
}
