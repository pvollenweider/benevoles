// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
// Reset only the already-owned, synthetic common video fixture.
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { ownsImportedNoEmailMember, readImportOwnership } from "../lib/member-import-ownership"
import { exactLegacyM2ForMigration, ownsNaturalMemberSeed, readSeedProofV2, type SeedIdentity } from "../lib/member-fixture-v2"

type OwnedMember = { id: string; organizationId: string; firstName: string; lastName: string; phone: string | null; email: string | null; responseStatus: number; createdAt: string; actualCreatedAt?: string }
const compactPhone = (value: string | null) => value?.replace(/\s/g, "")
export function ownsRecordedNoEmailMember(person: Omit<OwnedMember, "responseStatus" | "createdAt" | "organizationId"> & { organizationId: string | null } & Partial<Pick<SeedIdentity, "active" | "notes" | "birthDate" | "availabilityNote" | "availabilityPeriods" | "tags" | "createdAt">>, entries: OwnedMember[], now = Date.now()) {
  if (person.active !== undefined && person.active !== true || person.notes !== undefined && person.notes !== null || person.birthDate !== undefined && person.birthDate !== null || person.availabilityNote !== undefined && person.availabilityNote !== null || person.availabilityPeriods !== undefined && person.availabilityPeriods.length !== 0 || person.tags !== undefined && person.tags.length !== 0) return false
  return entries.some(entry => entry.id === person.id && /^[A-Za-z0-9_-]{8,100}$/.test(entry.id) &&
    entry.responseStatus === 201 && entry.organizationId === "default" && person.organizationId === "default" &&
    entry.firstName === "René" && person.firstName === entry.firstName && entry.lastName === "Aubert" && person.lastName === entry.lastName &&
    entry.email === null && person.email === null && compactPhone(entry.phone) === "0790009002" && compactPhone(person.phone) === "0790009002" &&
    (!entry.actualCreatedAt || !!person.createdAt && new Date(entry.actualCreatedAt).getTime() === new Date(person.createdAt).getTime()) &&
    Number.isFinite(Date.parse(entry.createdAt)) && Date.parse(entry.createdAt) <= now + 60_000 && Date.parse(entry.createdAt) >= now - 30 * 86_400_000)
}
export async function recordedMembers(): Promise<OwnedMember[]> {
  const entries: OwnedMember[] = []
  for (const [file, version] of [["owned-members.json", 1], ["owned-members-v2.json", 2]] as const) {
    let raw: string
    try { raw = await readFile(path.resolve("videos/output/members-management", file), "utf8") }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error }
    const ledger = JSON.parse(raw)
    assert(ledger.schemaVersion === version && ledger.scenario === "members-management" && Array.isArray(ledger.members) && ledger.members.length <= 30, "Invalid recorder ownership ledger")
    assert(ledger.members.every((entry: OwnedMember) => entry && typeof entry.id === "string" && typeof entry.createdAt === "string"), "Invalid ownership entries")
    if (version === 2) {
      assert(ledger.members.every((entry: OwnedMember) => entry.actualCreatedAt && Number.isFinite(Date.parse(entry.actualCreatedAt))), "V2 creation proof needs the actual API creation date")
      const hash = createHash("sha256").update(raw).digest("hex")
      assert(await readFile(path.resolve(`videos/output/members-management/owned-members-v2-${hash}.json`), "utf8") === raw, "Actual v2 creation ledger must have its immutable hashed snapshot")
    }
    entries.push(...ledger.members)
  }
  return entries
}

async function main() {
const url = new URL(process.env.DATABASE_URL ?? "")
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
assert.equal(url.port, "45433")
assert.equal(url.pathname, "/benevoles_video")
assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
try {
  const owned = await recordedMembers()
  const seedProof = await readSeedProofV2()
  const imported = await readImportOwnership()
  const recoveredImport = await readImportOwnership("recovered-import-members.json")
  const naturalImport = await readImportOwnership("owned-import-members-v2.json")
  const ownsImport = (person: Parameters<typeof ownsImportedNoEmailMember>[0]) => ownsImportedNoEmailMember(person, imported) || ownsImportedNoEmailMember(person, recoveredImport) || ownsImportedNoEmailMember(person, naturalImport)
  const fixture = await db.organization.findUniqueOrThrow({
    where: { id: "default" },
    include: { volunteers: true, admins: true, events: { include: { registrations: { include: { volunteer: true } } } } },
  })
  assert.equal(fixture.name, "Fêtes de Montvert", "Refuse to reset an unknown organization")
  // These two existing seed identities deliberately demonstrate missing email.
  const synthetic = (person: SeedIdentity) =>
    Boolean(person.email?.endsWith("@example.org")) ||
    (person.email === null && (exactLegacyM2ForMigration(person) || ownsNaturalMemberSeed(person, seedProof))) ||
    ownsRecordedNoEmailMember(person, owned) || ownsImport(person)
  assert(fixture.volunteers.every(synthetic), "Non-training member found")
  assert(fixture.events.every(event => event.registrations.every(registration => synthetic(registration.volunteer))), "Non-training registration found")
  assert(fixture.admins.every(admin => admin.email.endsWith("@example.org") || admin.email === "org-admin@localhost"), "Non-training administrator found")
  const team = await db.adminUser.findMany({ where: { email: { in: ["colette.owner@example.org", "sam.organizer@example.org", "lea.pending@example.org"] } }, select: { organizationId: true } })
  assert(team.every(admin => admin.organizationId === "default"), "Demo team belongs to another organization")
  // seed-demo deletes email-bearing fixtures only. Remove prior import rows
  // without email only by their actual ledger-backed global IDs and all fields.
  const importedWithoutEmail = fixture.volunteers.filter(person => ownsImport(person))
  for (const person of importedWithoutEmail) {
    const relations = await db.volunteer.findUniqueOrThrow({ where: { id: person.id }, include: { _count: { select: { registrations: true, invites: true, pushSubscriptions: true, questionAnswers: true } } } })
    assert(Object.values(relations._count).every(count => count === 0), "Imported no-email fixture has relations; refuse automatic reset")
    const deleted = await db.volunteer.deleteMany({ where: { id: person.id, organizationId: "default", email: null, firstName: person.firstName, lastName: person.lastName, phone: person.phone, createdAt: person.createdAt } })
    assert.equal(deleted.count, 1, "Exact owned imported no-email fixture changed before reset")
  }
  console.log(`Verified synthetic common fixture: ${fixture.events.length} events, ${fixture.volunteers.length} members. Reset confined to default training organization; other organizations preserved.`)
} finally { await db.$disconnect() }
await import("../../scripts/seed-demo")
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error instanceof Error ? error.message : "Demo fixture preparation failed"); process.exitCode = 1 })
