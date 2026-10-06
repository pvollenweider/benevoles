// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseCsv, parseXlsx } from "../../src/lib/csv-import"

export const correctedCsvSha = "0a6fa89c145807336641bfdcc9618e658ab7e4a3786cfc3ac0d7e06b0a0e357d"
export const correctedXlsxSha = "a69ebf47e917582578b53a1c5b22098f29d3f86b57ad37ae58dc00bd571e59fe"
export type ImportPerson = { id: string; organizationId: string | null; firstName: string; lastName: string; email: string | null; phone: string | null; tags: string[]; active: boolean; notes: string | null; birthDate: Date | string | null; availabilityPeriods: string[]; availabilityNote: string | null; createdAt: Date | string }
export type ImportOwnership = { schemaVersion: 1; scenario: "members-import"; csvSha256: string; xlsxSha256: string; provenance: "actual-api-before-after" | "read-only-correlated-recovery"; responseStatus: 200; receipt: { created: number; updated: number; skipped: number; errors: unknown[] }; observedAt: string; beforeIds: string[]; beforeCount: number; afterCount: number; members: ImportPerson[] }
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const sorted = (values: string[]) => JSON.stringify([...values].sort())
export async function correctedImportRows() {
  const directory = path.resolve("videos/fixtures/member-import")
  const csv = await readFile(path.join(directory, "membres-corriges.csv"))
  const xlsx = await readFile(path.join(directory, "membres-corriges.xlsx"))
  assert(hash(csv) === correctedCsvSha && hash(xlsx) === correctedXlsxSha, "Corrected import fixtures changed; ownership proof must be reviewed")
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
type RecordedContact = { id: string; organizationId: string; firstName: string; lastName: string; email: string | null; phone: string | null; responseStatus: number; createdAt: string }
async function recordedContactEvidence(): Promise<RecordedContact[]> {
  const value = JSON.parse(await readFile(path.resolve("videos/output/members-management/owned-members.json"), "utf8"))
  assert(value.schemaVersion === 1 && value.scenario === "members-management" && Array.isArray(value.members) && value.members.length <= 30, "Actual manual creation ledger required")
  return value.members
}
export function validateImportBaseline(people: ImportPerson[], recorded: RecordedContact[], now = Date.now()) {
  assert(people.length === 26 && new Set(people.map(person => person.id)).size === 26 && people.every(person => person.organizationId === "default"), "Baseline requires 24 email-bearing fixtures and two exact persistent no-email seeds")
  const emailMembers = people.filter(person => person.email !== null)
  assert(emailMembers.length === 24 && emailMembers.every(person => person.email?.endsWith("@example.org")), "Exactly 24 fictional email-bearing baseline members required")
  const missingEmail = people.filter(person => person.email === null)
  const message = missingEmail.find(person => person.id === "cmuww4yid000an3a5bttlnq7r")
  assert(message && message.firstName === "René" && message.lastName === "Aubert" && message.phone?.replace(/\s/g, "") === "0790009002" && sorted(message.tags) === "[]" && newImportDefaults(message) && recorded.some(entry => entry.id === message.id && entry.organizationId === "default" && entry.firstName === message.firstName && entry.lastName === message.lastName && entry.email === null && entry.phone?.replace(/\s/g, "") === "0790009002" && entry.responseStatus === 201 && Number.isFinite(Date.parse(entry.createdAt)) && Date.parse(entry.createdAt) <= now + 60_000 && Date.parse(entry.createdAt) >= now - 30 * 86_400_000), "Exact recent 201-created manual contact and all current default fields required")
  const management = missingEmail.find(person => person.id === "video-member-management-2")
  assert(management && management.phone === "079 000 02 00" && management.active === true && management.notes === "Contact à joindre par téléphone pour les horaires." && management.birthDate === null && sorted(management.availabilityPeriods) === sorted(["evening"]) && management.availabilityNote === null && ((management.firstName === "Sébastien" && management.lastName === "Morel 3" && sorted(management.tags) === sorted(["logistique", "permis-b"])) || (management.firstName === "René" && management.lastName === "Sansmail" && sorted(management.tags) === sorted(["accueil"]))), "Exact members scenario seed fields required")
  assert(missingEmail.length === 2 && message.id !== management.id)
}
export async function collectImportOwnership(before: ImportPerson[], after: ImportPerson[], receipt: ImportOwnership["receipt"], status: number, startedAt: string, finishedAt: string): Promise<ImportOwnership> {
  assert(status === 200 && receipt.created === 38 && receipt.updated === 2 && receipt.skipped === 0 && Array.isArray(receipt.errors) && receipt.errors.length === 0, "Actual complete import response required")
  validateImportBaseline(before, await recordedContactEvidence())
  assert(after.length === 64, "Exact baseline plus 38 import creations required")
  const beforeIds = before.map(person => person.id)
  assert(new Set(beforeIds).size === before.length && before.every(person => person.organizationId === "default"))
  const created = after.filter(person => !beforeIds.includes(person.id))
  assert(created.length === 38 && beforeIds.every(id => after.some(person => person.id === id)), "Actual before/after IDs must prove 38 creations without removals")
  const rows = await correctedImportRows()
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
  return { schemaVersion: 1, scenario: "members-import", csvSha256: correctedCsvSha, xlsxSha256: correctedXlsxSha, provenance: "actual-api-before-after", responseStatus: 200, receipt, observedAt: finishedAt, beforeIds, beforeCount: before.length, afterCount: after.length, members: created }
}
export function ownsImportedNoEmailMember(person: Partial<ImportPerson>, ledger: ImportOwnership | null, now = Date.now()) {
  if (!ledger || ledger.schemaVersion !== 1 || ledger.scenario !== "members-import" || ledger.csvSha256 !== correctedCsvSha || ledger.xlsxSha256 !== correctedXlsxSha || ledger.responseStatus !== 200 || ledger.beforeCount !== 26 || ledger.afterCount !== 64 || ledger.beforeIds.length !== 26 || new Set(ledger.beforeIds).size !== 26 || !ledger.beforeIds.includes("cmuww4yid000an3a5bttlnq7r") || !ledger.beforeIds.includes("video-member-management-2") || ledger.receipt.created !== 38 || ledger.receipt.updated !== 2 || ledger.receipt.skipped !== 0 || ledger.receipt.errors.length || ledger.members.length !== 38) return false
  if (!Number.isFinite(Date.parse(ledger.observedAt)) || Date.parse(ledger.observedAt) > now + 60_000 || Date.parse(ledger.observedAt) < now - 30 * 86_400_000) return false
  if (!person.id || !/^[A-Za-z0-9_-]{8,100}$/.test(person.id) || person.organizationId !== "default" || person.firstName !== "René" || person.lastName !== "Sansmail" || person.email !== null || person.phone !== "+41 79 000 10 03" || !Array.isArray(person.tags) || sorted(person.tags) !== sorted(["accueil"])) return false
  if (!newImportDefaults(person as ImportPerson) || !person.createdAt) return false
  return ledger.members.some(owned => owned.id === person.id && !ledger.beforeIds.includes(person.id!) && sameImportFields(owned, person as ImportPerson) && newImportDefaults(owned) && new Date(owned.createdAt).getTime() === new Date(person.createdAt!).getTime())
}
export async function readImportOwnership(file: "owned-import-members.json" | "recovered-import-members.json" = "owned-import-members.json"): Promise<ImportOwnership | null> {
  try {
    assert(file === "owned-import-members.json" || file === "recovered-import-members.json", "Only exact ownership ledger files accepted")
    const ledger = JSON.parse(await readFile(path.resolve("videos/output/members-import", file), "utf8")) as ImportOwnership
    assert(ledger.schemaVersion === 1 && ledger.scenario === "members-import" && Array.isArray(ledger.members) && ledger.members.length === 38 && Array.isArray(ledger.beforeIds) && ledger.beforeIds.length === 26, "Invalid import ownership ledger")
    await correctedImportRows()
    return ledger
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
}
