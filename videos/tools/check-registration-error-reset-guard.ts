// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Prove an existing owned fixture is not silently replaced. No reset performed. */
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { prepareRegistrationErrorFixture } from "../lib/prepare-registration-error-fixture"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(url.hostname === "localhost" && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  try {
    const snapshot = async () => ({
      registrations: await db.registration.findMany({ where: { eventId: "video-errors-event" }, orderBy: { id: "asc" }, select: { id: true, status: true, volunteerId: true, shiftId: true } }),
      messages: await db.notificationOutbox.findMany({ where: { organizationId: "video-errors" }, orderBy: { id: "asc" }, select: { id: true, status: true, attempts: true } }),
      people: await db.volunteer.findMany({ where: { organizationId: "video-errors" }, orderBy: { id: "asc" }, select: { id: true, email: true } }),
    })
    const before = await snapshot()
    assert(before.registrations.length > 0, "Populated fixture required to test preservation")
    await assert.rejects(prepareRegistrationErrorFixture(db), /Existing fixture requires explicit reset/)
    assert.deepEqual(await snapshot(), before)
    console.log(`✓ Existing synthetic fixture refused without explicit reset; ${before.registrations.length} registrations, people and queued messages unchanged`)
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Reset guard failed"); process.exitCode = 1 })
