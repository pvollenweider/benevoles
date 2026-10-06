// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Reset only the already-owned, synthetic common video fixture.
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

async function main() {
const url = new URL(process.env.DATABASE_URL ?? "")
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
assert.equal(url.port, "45433")
assert.equal(url.pathname, "/benevoles_video")
assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
try {
  const fixture = await db.organization.findUniqueOrThrow({
    where: { id: "default" },
    include: { volunteers: true, admins: true, events: { include: { registrations: { include: { volunteer: true } } } } },
  })
  assert.equal(fixture.name, "Fêtes de Montvert", "Refuse to reset an unknown organization")
  // These two existing seed identities deliberately demonstrate missing email.
  const synthetic = (person: { id: string; email: string | null }) =>
    Boolean(person.email?.endsWith("@example.org")) ||
    (person.email === null && ["video-message-sansmail", "video-member-management-2"].includes(person.id))
  assert(fixture.volunteers.every(synthetic), "Non-training member found")
  assert(fixture.events.every(event => event.registrations.every(registration => synthetic(registration.volunteer))), "Non-training registration found")
  assert(fixture.admins.every(admin => admin.email.endsWith("@example.org") || admin.email === "org-admin@localhost"), "Non-training administrator found")
  const team = await db.adminUser.findMany({ where: { email: { in: ["colette.owner@example.org", "sam.organizer@example.org", "lea.pending@example.org"] } }, select: { organizationId: true } })
  assert(team.every(admin => admin.organizationId === "default"), "Demo team belongs to another organization")
  console.log(`Verified synthetic common fixture: ${fixture.events.length} events, ${fixture.volunteers.length} members. Reset confined to default training organization; other organizations preserved.`)
} finally { await db.$disconnect() }
await import("../../scripts/seed-demo")
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Demo fixture preparation failed"); process.exitCode = 1 })
