// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Database READ ONLY recovery for an exact completed fictional import; writes evidence only. */
import assert from "node:assert/strict"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { collectImportOwnership, correctedImportRows, sameImportFields, newImportDefaults, readImportOwnership, ownsImportedNoEmailMember } from "../lib/member-import-ownership"

async function main() {
  const afterOwnedImport = process.argv.length === 3 && process.argv[2] === "--after-owned-import"
  assert(process.argv.length === 2 || afterOwnedImport, "No broad recovery arguments accepted")
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video", "Only exact isolated video DB")
  const directory = path.resolve("videos/output/members-import")
  const checks = JSON.parse(await readFile(path.join(directory, "import-checks.json"), "utf8"))
  assert(checks.confirmed?.created === 38 && checks.confirmed.updated === 2 && checks.confirmed.skipped === 0 && checks.confirmed.errors?.length === 0 && checks.confirmed.totalParsed === 40, "Actual completed recorder response evidence required")
  assert(checks.correctedPreview?.create === 38 && checks.correctedPreview.update === 2 && checks.correctedPreview.error === 0 && checks.repeatPreview?.create === 1 && checks.repeatPreview.skip === 39, "Both exact corrected and repeat preview evidence required")
  const checkedAt = Date.parse(checks.checkedAt)
  assert(Number.isFinite(checkedAt) && checkedAt <= Date.now() + 60_000 && checkedAt >= Date.now() - 86_400_000, "Only recent completed import recoverable")
  const sourceRows = await correctedImportRows()
  const previous = afterOwnedImport ? await readImportOwnership() : null
  assert(!afterOwnedImport || previous, "Previous immutable exact import ledger required")
  const current = await loadCurrentVideoPrisma("http://localhost:43102")
  const db = current.db
  try {
    const evidence = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: "default" }, include: { admins: true } })
      assert(organization.name === "Fêtes de Montvert" && organization.admins.every(a => a.email.endsWith("@example.org") || a.email === "org-admin@localhost"), "Organization identity or fictional admin scope failed")
      const logs = await tx.orgLog.findMany({ where: { organizationId: "default", action: "member.imported", entityType: "Member", entityId: "import", createdAt: { gte: afterOwnedImport ? new Date(Math.max(Date.parse(previous!.observedAt), Date.now() - 30 * 60_000)) : new Date(checkedAt - 20 * 60_000), lte: new Date(afterOwnedImport ? Date.now() : checkedAt) } } })
      const matchedLogs = logs.filter(log => {
        const changes = log.changes as Record<string, { to: unknown }> | null
        return changes?.created?.to === 38 && changes.updated?.to === 2 && changes.skipped?.to === 0 && changes.errors?.to === 0 && log.actorType === "admin" && organization.admins.some(a => a.id === log.actorId)
      })
      assert.equal(matchedLogs.length, 1, "Exactly one real correlated import log required")
      const log = matchedLogs[0]
      const currentMembers = await tx.volunteer.findMany({ where: { organizationId: "default" } })
      const previousRows = currentMembers.filter(person => ownsImportedNoEmailMember(person, previous))
      if (afterOwnedImport) assert(previousRows.length === 1 && previousRows[0].id === "cmuwwcje1000en3a5ou3d5vme", "Only exact prior ledger-backed no-email import can be excluded")
      const after = afterOwnedImport ? currentMembers.filter(person => !previousRows.some(old => old.id === person.id)) : currentMembers
      assert.equal(after.length, 64, "Only 24 email-bearing baseline members, two exact persistent seeds and 38 imports allowed")
      const matched = sourceRows.map(row => {
        const people = after.filter(person => sameImportFields(person, row))
        assert.equal(people.length, 1, "Every full CSV identity must match exactly one global ID")
        return people[0]
      })
      assert.equal(new Set(matched.map(person => person.id)).size, 40, "Source rows must map to 40 distinct global IDs")
      const created = matched.slice(2)
      assert(created.every(person => newImportDefaults(person) && person.createdAt.getTime() >= log.createdAt.getTime() - 120_000 && person.createdAt <= log.createdAt), "Every created row must match all default fields and the real logged creation window")
      const withRelations = await tx.volunteer.findMany({ where: { id: { in: created.map(person => person.id) } }, include: { _count: { select: { registrations: true, invites: true, pushSubscriptions: true, questionAnswers: true } } } })
      assert(withRelations.length === 38 && withRelations.every(person => person.organizationId === "default" && Object.values(person._count).every(count => count === 0)), "Exact global IDs must belong only to untouched imported rows")
      const before = after.filter(person => !created.some(item => item.id === person.id))
      const ledger = await collectImportOwnership(before, after, checks.confirmed, 200, new Date(log.createdAt.getTime() - 120_000).toISOString(), log.createdAt.toISOString())
      return { ...ledger, provenance: "read-only-correlated-recovery" as const, observedAt: new Date().toISOString(), recoveredFrom: { recorderChecksAt: checks.checkedAt, recorderChecksBelongToPreviousTake: afterOwnedImport, responseReconstructedFromActualOrgLog: afterOwnedImport, actualOrgLogId: log.id, loggedAt: log.createdAt.toISOString(), excludedPreviouslyOwnedIds: previousRows.map(person => person.id), beforeIdsDerivedFromExactCreatedRows: true, actualBeforeSnapshotAvailable: false } }
    })
    await writeFile(path.join(directory, afterOwnedImport ? "recovered-import-members.json" : "owned-import-members.json"), JSON.stringify(evidence, null, 2), { flag: "wx" })
    console.log("Read-only recovery verified exact CSV/XLSX, 40 identities, 38 creations, two updates and one real import log. Ledger saved; no database changes or retroactive capture proof.")
  } finally { await db.$disconnect(); await current.unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Import ownership recovery refused"); process.exitCode = 1 })
