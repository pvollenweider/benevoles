// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseCsv, parseXlsx } from "../../src/lib/csv-import"
import { ownsNaturalMemberSeed, readSeedProofV2, type SeedProofV2 } from "./member-fixture-v2"

export const correctedCsvSha = "0a6fa89c145807336641bfdcc9618e658ab7e4a3786cfc3ac0d7e06b0a0e357d"
export const correctedXlsxSha = "a69ebf47e917582578b53a1c5b22098f29d3f86b57ad37ae58dc00bd571e59fe"
export const correctedCsvShaV2 = "efed64cceffadc0038934b21511bd5f39598aa0ff402e54c7a9f676cf160b855"
export const correctedXlsxShaV2 = "f38d0b69c98db4144fc02068999af0f4a83a5cfbc16fdfc7b2b92648d853a444"
export const reviewCsvShaV2 = "70744432b988b08b800e09964ff777c2baf48ab3f706b9e392e62d9f440852ea"
export const reviewXlsxShaV2 = "80ae5a6cfcafb7a52ba54ba38366d9480140d6d23b0e17b2dc38bfff85940146"
export type ImportPerson = { id: string; organizationId: string | null; firstName: string; lastName: string; email: string | null; phone: string | null; tags: string[]; active: boolean; notes: string | null; birthDate: Date | string | null; availabilityPeriods: string[]; availabilityNote: string | null; createdAt: Date | string }
export type ImportOwnership = { schemaVersion: 1 | 2 | 3; manualContact?: RecordedContact; seedProof?: SeedProofV2; scenario: "members-import"; csvSha256: string; xlsxSha256: string; provenance: "actual-api-before-after" | "read-only-correlated-recovery"; responseStatus: 200; receipt: { created: number; updated: number; skipped: number; errors: unknown[] }; observedAt: string; beforeIds: string[]; beforeCount: number; afterCount: number; members: ImportPerson[] }
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const sorted = (values: string[]) => JSON.stringify([...values].sort())
export async function verifyNaturalImportFixtures() {
  for (const [name, expected] of [["membres-a-verifier.csv", reviewCsvShaV2], ["membres-a-verifier.xlsx", reviewXlsxShaV2]] as const) assert(hash(await readFile(path.resolve("videos/fixtures/member-import/v2", name))) === expected, "Natural-name review fixture changed")
  await correctedImportRows(2)
}
export async function correctedImportRows(version: 1 | 2 = 1) {
  const directory = path.resolve("videos/fixtures/member-import", version === 2 ? "v2" : ".")
  const csv = await readFile(path.join(directory, "membres-corriges.csv"))
  const xlsx = await readFile(path.join(directory, "membres-corriges.xlsx"))
  assert(hash(csv) === (version === 2 ? correctedCsvShaV2 : correctedCsvSha) && hash(xlsx) === (version === 2 ? correctedXlsxShaV2 : correctedXlsxSha), "Corrected import fixtures changed; ownership proof must be reviewed")
  const a = parseCsv(csv), b = await parseXlsx(xlsx)
  assert(a.rows.length === 40 && !a.errors.length && !b.errors.length && JSON.stringify(a.rows) === JSON.stringify(b.rows), "Exact CSV and XLSX rows must agree")
  return a.rows.map(row => ({ firstName: row.firstName, lastName: row.lastName, email: row.email ?? null, phone: row.phone ?? null, tags: row.tags ?? [] }))
}
export function sameImportFields(person: ImportPerson, row: { firstName: string; lastName: string; email: string | null; phone: string | null; tags: string[] }) {
  return person.organizationId === "default" && person.firstName === row.firstName && person.lastName === row.lastName && person.email === row.email && person.phone === row.phone && sorted(person.tags) === sorted(row.tags)
}
export function newImportDefaults(person: ImportPerson) {
  return person.active === true && person.notes === null && person.birthDate === null && Array.isArray(person.availabilityPeriods) && person.availabilityPeriods.length === 0 && person.availabilityNote === null
}
type RecordedContact = { id: string; organizationId: string; firstName: string; lastName: string; email: string | null; phone: string | null; responseStatus: number; createdAt: string; actualCreatedAt?: string }
function exactRecordedContact(entry: RecordedContact | undefined, now: number): entry is RecordedContact {
  return !!entry && /^[A-Za-z0-9_-]{8,100}$/.test(entry.id) && entry.organizationId === "default" &&
    entry.firstName === "René" && entry.lastName === "Aubert" && entry.email === null &&
    entry.phone?.replace(/\s/g, "") === "0790009002" && entry.responseStatus === 201 &&
    Number.isFinite(Date.parse(entry.createdAt)) && Date.parse(entry.createdAt) <= now + 60_000 &&
    Date.parse(entry.createdAt) >= now - 30 * 86_400_000
}
async function recordedContactEvidence(): Promise<RecordedContact[]> {
  const { recordedMembers } = await import("../tools/prepare-demo")
  return recordedMembers()
}
export function validateImportBaseline(people: ImportPerson[], recorded: RecordedContact[], now = Date.now(), seedProof: SeedProofV2 | null = null) {
  assert(people.length === 26 && new Set(people.map(person => person.id)).size === 26 && people.every(person => person.organizationId === "default"), "Baseline requires 24 email-bearing fixtures and two exact persistent no-email seeds")
  const emailMembers = people.filter(person => person.email !== null)
  assert(emailMembers.length === 24 && emailMembers.every(person => person.email?.endsWith("@example.org")), "Exactly 24 fictional email-bearing baseline members required")
  const missingEmail = people.filter(person => person.email === null)
  const candidates = missingEmail.filter(person => recorded.some(entry => entry.id === person.id && exactRecordedContact(entry, now) && (!entry.actualCreatedAt || Number.isFinite(Date.parse(entry.actualCreatedAt)) && Date.parse(entry.actualCreatedAt) === new Date(person.createdAt).getTime())))
  assert(candidates.length === 1, "Exactly one current contact must match a recent actual 201 creation ledger")
  const message = candidates[0]
  assert(message.firstName === "René" && message.lastName === "Aubert" && message.phone?.replace(/\s/g, "") === "0790009002" && sorted(message.tags) === "[]" && newImportDefaults(message), "Exact recent 201-created manual contact and all current default fields required")
  const management = missingEmail.find(person => person.id === "video-member-management-2")
  assert(management && (seedProof ? ownsNaturalMemberSeed(management, seedProof, now) : management.phone === "079 000 02 00" && management.active === true && management.notes === "Contact à joindre par téléphone pour les horaires." && management.birthDate === null && sorted(management.availabilityPeriods) === sorted(["evening"]) && management.availabilityNote === null && ((management.firstName === "Sébastien" && management.lastName === "Morel 3" && sorted(management.tags) === sorted(["logistique", "permis-b"])) || (management.firstName === "René" && management.lastName === "Sansmail" && sorted(management.tags) === sorted(["accueil"])))), "Exact members scenario seed fields required")
  assert(missingEmail.length === 2 && message.id !== management.id)
  return recorded.find(entry => entry.id === message.id && exactRecordedContact(entry, now))!
}
export async function collectImportOwnership(before: ImportPerson[], after: ImportPerson[], receipt: ImportOwnership["receipt"], status: number, startedAt: string, finishedAt: string): Promise<ImportOwnership> {
  assert(status === 200 && receipt.created === 38 && receipt.updated === 2 && receipt.skipped === 0 && Array.isArray(receipt.errors) && receipt.errors.length === 0, "Actual complete import response required")
  const seedProof = await readSeedProofV2()
  assert(seedProof, "Current natural-name fixture proof required for a new import")
  const manualContact = validateImportBaseline(before, await recordedContactEvidence(), Date.now(), seedProof)
  assert(after.length === 64, "Exact baseline plus 38 import creations required")
  const beforeIds = before.map(person => person.id)
  assert(new Set(beforeIds).size === before.length && before.every(person => person.organizationId === "default"))
  const created = after.filter(person => !beforeIds.includes(person.id))
  assert(created.length === 38 && beforeIds.every(id => after.some(person => person.id === id)), "Actual before/after IDs must prove 38 creations without removals")
  const rows = await correctedImportRows(2)
  for (const row of rows) {
    const matches = after.filter(person => sameImportFields(person, row))
    assert(matches.length === 1, "Every exact corrected source row must map to one global member ID")
    if (!rows.slice(0, 2).includes(row)) {
      const person = matches[0]
      assert(created.some(item => item.id === person.id) && newImportDefaults(person), "New row is not an exact default-state import creation")
      const createdAt = new Date(person.createdAt).getTime()
      assert(createdAt >= Date.parse(startedAt) - 1000 && createdAt <= Date.parse(finishedAt) + 1000, "Creation timestamp must belong to the actual import window")
    } else assert(beforeIds.includes(matches[0].id), "First two rows must update pre-existing members")
  }
  return { schemaVersion: 3, manualContact, seedProof, scenario: "members-import", csvSha256: correctedCsvShaV2, xlsxSha256: correctedXlsxShaV2, provenance: "actual-api-before-after", responseStatus: 200, receipt, observedAt: finishedAt, beforeIds, beforeCount: before.length, afterCount: after.length, members: created }
}
export function ownsImportedNoEmailMember(person: Partial<ImportPerson>, ledger: ImportOwnership | null, now = Date.now()) {
  if (!ledger || ![1, 2, 3].includes(ledger.schemaVersion) || ledger.scenario !== "members-import" || ledger.csvSha256 !== (ledger.schemaVersion === 3 ? correctedCsvShaV2 : correctedCsvSha) || ledger.xlsxSha256 !== (ledger.schemaVersion === 3 ? correctedXlsxShaV2 : correctedXlsxSha) || ledger.responseStatus !== 200 || ledger.beforeCount !== 26 || ledger.afterCount !== 64 || ledger.beforeIds.length !== 26 || new Set(ledger.beforeIds).size !== 26 || !ledger.beforeIds.includes("video-member-management-2") || ledger.receipt.created !== 38 || ledger.receipt.updated !== 2 || ledger.receipt.skipped !== 0 || ledger.receipt.errors.length || ledger.members.length !== 38) return false
  if (ledger.schemaVersion === 1 ? !ledger.beforeIds.includes("cmuww4yid000an3a5bttlnq7r") : !exactRecordedContact(ledger.manualContact, now) || !ledger.beforeIds.includes(ledger.manualContact!.id)) return false
  if (!Number.isFinite(Date.parse(ledger.observedAt)) || Date.parse(ledger.observedAt) > now + 60_000 || Date.parse(ledger.observedAt) < now - 30 * 86_400_000) return false
  if (ledger.schemaVersion === 3 && (!ledger.seedProof || !ownsNaturalMemberSeed(ledger.seedProof.members.find(member => member.id === "video-member-management-2") ?? {}, ledger.seedProof, now))) return false
  if (!person.id || !/^[A-Za-z0-9_-]{8,100}$/.test(person.id) || person.organizationId !== "default" || person.firstName !== "René" || person.lastName !== (ledger.schemaVersion === 3 ? "Meyer" : "Sansmail") || person.email !== null || person.phone !== "+41 79 000 10 03" || !Array.isArray(person.tags) || sorted(person.tags) !== sorted(["accueil"])) return false
  if (!newImportDefaults(person as ImportPerson) || !person.createdAt) return false
  return ledger.members.some(owned => owned.id === person.id && !ledger.beforeIds.includes(person.id!) && sameImportFields(owned, person as ImportPerson) && newImportDefaults(owned) && new Date(owned.createdAt).getTime() === new Date(person.createdAt!).getTime())
}
export async function readImportOwnership(file: "owned-import-members.json" | "recovered-import-members.json" | "owned-import-members-v2.json" = "owned-import-members.json"): Promise<ImportOwnership | null> {
  try {
    assert(["owned-import-members.json", "recovered-import-members.json", "owned-import-members-v2.json"].includes(file), "Only exact ownership ledger files accepted")
    const ledger = JSON.parse(await readFile(path.resolve("videos/output/members-import", file), "utf8")) as ImportOwnership
    assert([1, 2, 3].includes(ledger.schemaVersion) && ledger.scenario === "members-import" && Array.isArray(ledger.members) && ledger.members.length === 38 && Array.isArray(ledger.beforeIds) && ledger.beforeIds.length === 26, "Invalid import ownership ledger")
    await correctedImportRows(ledger.schemaVersion === 3 ? 2 : 1)
    return ledger
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
}
