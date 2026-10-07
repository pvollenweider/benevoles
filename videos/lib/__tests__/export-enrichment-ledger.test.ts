// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "vitest"
import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { exportEnrichmentFile, readExportEnrichment } from "../enrich-export-classroom"

const valid = () => ({ organizationId: "video-data-exports", eventId: "video-data-exports-event", memberId: "video-data-exports-member-2", shiftId: "cmuvpbr9i0001jsa553j0izrc", signupStatus: 201, registrationId: "synthetic-registration-id", initialRegistrationIds: ["cmuvpbr9k0002jsa5lu09cnww", "cmuvpbr9p0003jsa5nh9ohyc1", "cmuvpbr9q0004jsa58dp7b9b4"] })
async function fixture(data: ReturnType<typeof valid>, badHash = false) {
  const directory = await mkdtemp(path.join(tmpdir(), "export-ledger-test-"))
  const bytes = Buffer.from(JSON.stringify(data))
  await writeFile(path.join(directory, exportEnrichmentFile), bytes)
  await writeFile(path.join(directory, `${exportEnrichmentFile}.sha256`), badHash ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex"))
  return directory
}
test("exact owned ledger is accepted without DB or API", async () => {
  const directory = await fixture(valid())
  assert.equal((await readExportEnrichment(directory)).signupStatus, 201)
})
test("tampered evidence is rejected", async () => {
  await assert.rejects(readExportEnrichment(await fixture(valid(), true)), /ledger changed/)
})
test("hash-valid evidence cannot authorize another organization or a failed signup", async () => {
  for (const change of [{ organizationId: "default" }, { signupStatus: 409 }, { memberId: "video-data-exports-member-3" }, { shiftId: "another-shift" }]) {
    await assert.rejects(readExportEnrichment(await fixture({ ...valid(), ...change })))
  }
})
