// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Identity-only migration of guarded private fixtures. Never rebuilds or sends. */
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { privateIdentities, readPrivateIdentityVersion, type PrivateIdentityScope } from "../lib/private-identity-version"
import { protectedExportIdentityDigest } from "../lib/export-identity-version"
import { verifyDeliveryReviewFixture } from "../lib/verify-delivery-review-fixture"
import { assertMergeResetFixture } from "../lib/member-merge-reset-guard"

async function main() {
  const [scope, authorization, ...extra] = process.argv.slice(2)
  assert((scope === "delivery" || scope === "merge") && ["--apply-exact-owned", "--check-only"].includes(authorization) && !extra.length)
  const kind = scope as PrivateIdentityScope, identities = privateIdentities[kind], orgId = identities.organizationId
  const runtime = await loadCurrentVideoPrisma(kind === "delivery" ? "http://localhost:43106" : "http://localhost:43110")
  try {
    const ownershipFile = path.join(identities.directory, kind === "merge" ? "ownership.json" : "capture-checks.json")
    const evidenceBytes = await readFile(ownershipFile), evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex")
    const ownership = JSON.parse(evidenceBytes.toString("utf8"))
    if (kind === "merge") assert.equal((await readFile(path.join(identities.directory, "ownership.sha256"), "utf8")).split(/\s/)[0], evidenceSha256)
    const guard = async (db: typeof runtime.db) => {
      if (kind === "delivery") await verifyDeliveryReviewFixture(db, identities.directory)
      else await assertMergeResetFixture(db, process.env.DATABASE_URL ?? "", ownership)
    }
    await guard(runtime.db)
    if (await readPrivateIdentityVersion(kind)) { console.log(`✓ ${kind} identities already migrated; no writes`); return }
    if (authorization === "--check-only") { console.log(`✓ ${kind} exact read-only identity preflight; no writes`); return }
    const preservedEvidence = path.join(identities.directory, "identity-v1-evidence.json")
    try { assert.equal(createHash("sha256").update(await readFile(preservedEvidence)).digest("hex"), evidenceSha256) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await writeFile(preservedEvidence, evidenceBytes) }
    const snapshot = async (db: typeof runtime.db) => ({
      organization: await db.organization.findUniqueOrThrow({ where: { id: orgId } }),
      members: await db.volunteer.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      admins: await db.adminUser.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      leaders: await db.sectorLeader.findMany({ where: { event: { organizationId: orgId } }, orderBy: { id: "asc" } }),
      messages: await db.targetedMessage.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      events: await db.event.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" }, include: { shifts: { orderBy: { id: "asc" } }, registrations: { orderBy: { id: "asc" } }, memberInvites: { orderBy: { id: "asc" } }, pages: { orderBy: { id: "asc" } }, questions: { orderBy: { id: "asc" }, include: { answers: { orderBy: { id: "asc" } } } }, milestones: { orderBy: { id: "asc" } }, logs: { orderBy: { id: "asc" } } } }),
      orgLogs: await db.orgLog.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      dismissals: await db.duplicateDismissal.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      outbox: await db.notificationOutbox.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      outcomes: await db.deliveryOutcome.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
      push: await db.pushSubscription.findMany({ where: { volunteer: { organizationId: orgId } }, orderBy: { id: "asc" } }),
    })
    const changes = await runtime.db.$transaction(async tx => {
      const db = tx as unknown as typeof runtime.db
      await guard(db)
      const before = await snapshot(db)
      assert.equal(before.leaders.length, 0)
      const changedMemberIds: string[] = []
      for (const member of before.members) {
        if (kind === "merge" && !member.active && member.mergedIntoId === "video-member-merge-a") {
          assert.equal(member.firstName, ""); assert.equal(member.lastName, "")
          continue // Never restore the absorbed person's erased identity.
        }
        const key = member.id.replace(kind === "delivery" ? "video-delivery-member-" : "video-member-merge-", "")
        const lastName = (identities.members as Record<string, string>)[key]
        assert(lastName && member.lastName === "Exemple")
        await db.volunteer.update({ where: { id: member.id }, data: { lastName, updatedAt: member.updatedAt } })
        changedMemberIds.push(member.id)
      }
      const authors = new Map<string, { old: string; current: string }>()
      for (const admin of before.admins) {
        const organizer = kind === "delivery" && admin.id === "video-delivery-organizer"
        const old = organizer ? "Marc Exemple" : "Élodie Exemple"
        const current = organizer ? privateIdentities.delivery.organizer : identities.owner
        assert.equal(admin.name, old)
        await db.adminUser.update({ where: { id: admin.id }, data: { name: current, updatedAt: admin.updatedAt } })
        authors.set(admin.id, { old, current })
      }
      for (const message of before.messages) {
        const author = message.authorId ? authors.get(message.authorId) : null
        assert(author && message.authorName === author.old)
        await db.targetedMessage.update({ where: { id: message.id }, data: { authorName: author.current } })
      }
      const after = await snapshot(db)
      const protectedBeforeSha256 = protectedExportIdentityDigest(before), protectedAfterSha256 = protectedExportIdentityDigest(after)
      assert.equal(protectedBeforeSha256, protectedAfterSha256, "Protected private fixture bytes changed")
      return { protectedBeforeSha256, protectedAfterSha256, changedMemberIds, changedAdminIds: before.admins.map(a => a.id), changedAuthorHistoryIds: before.messages.map(m => m.id), organizationCreatedAt: before.organization.createdAt.toISOString() }
    }, { timeout: 30000 })
    const bytes = Buffer.from(JSON.stringify({ scope: kind, version: 2, organizationId: orgId, identities, product: runtime.product, evidenceSha256, evidenceFile: "identity-v1-evidence.json", migratedAt: new Date().toISOString(), ...changes, note: "Encrypted sent payloads, erased tombstones, tokens, results, logs and fixture-generation ownership are preserved." }, null, 2))
    const file = path.join(identities.directory, "identity-version-2.json")
    await writeFile(file, bytes); await writeFile(`${file}.sha256`, createHash("sha256").update(bytes).digest("hex") + "\n")
    await guard(runtime.db)
    console.log(`✓ ${kind} exact identity migration; protected fields preserved, no recreation or sending`)
  } finally { await runtime.db.$disconnect(); await runtime.unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Private identity migration failed"); process.exitCode = 1 })
