// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Local, exact-ID identity migration. No recreation, mail, consent or history deletion. */
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { loadCurrentVideoPrisma } from "../lib/current-product-prisma"
import { verifyExportClassroom } from "../lib/verify-export-review-fixture"
import { exportIdentityVersion, exportIdentityFile, exportIdentityV2, protectedExportIdentityDigest } from "../lib/export-identity-version"

async function main() {
  assert.equal(process.env.NODE_ENV, "production")
  assert.equal(process.argv.slice(2).join(" "), "--apply-exact-owned", "Explicit scoped migration required")
  const directory = "videos/output/data-exports-archives", org = "video-data-exports", eventId = "video-data-exports-event"
  const runtime = await loadCurrentVideoPrisma("http://localhost:43102")
  try {
    await verifyExportClassroom(runtime.db)
    if (await exportIdentityVersion()) { console.log("✓ Export identities already migrated; no writes"); return }
    const actionBytes = await readFile(path.join(directory, "fourteen-column-actions.json"))
    const actionSha256 = createHash("sha256").update(actionBytes).digest("hex")
    assert.equal(actionSha256, (await readFile(path.join(directory, "fourteen-column-actions.json.sha256"), "utf8")).trim())
    const action = JSON.parse(actionBytes.toString("utf8")); assert.equal(action.completed, true)
    const snapshot = async (tx: typeof runtime.db) => ({
      organization: await tx.organization.findUniqueOrThrow({ where: { id: org } }),
      members: await tx.volunteer.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      admins: await tx.adminUser.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      leaders: await tx.sectorLeader.findMany({ where: { eventId }, orderBy: { id: "asc" } }),
      messages: await tx.targetedMessage.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      event: await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { shifts: { orderBy: { id: "asc" } }, registrations: { orderBy: { id: "asc" } }, memberInvites: { orderBy: { id: "asc" } }, pages: { orderBy: { id: "asc" } }, questions: { orderBy: { id: "asc" }, include: { answers: { orderBy: { id: "asc" } } } }, milestones: { orderBy: { id: "asc" } }, logs: { orderBy: { id: "asc" } } } }),
      push: await tx.pushSubscription.findMany({ where: { volunteer: { organizationId: org } }, orderBy: { id: "asc" } }),
      orgLogs: await tx.orgLog.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      outbox: await tx.notificationOutbox.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
      outcomes: await tx.deliveryOutcome.findMany({ where: { organizationId: org }, orderBy: { id: "asc" } }),
    })
    const result = await runtime.db.$transaction(async tx => {
      const before = await snapshot(tx as unknown as typeof runtime.db)
      assert(before.members.every(m => m.lastName === "Exemple"))
      assert.equal(before.admins.length, 1); assert.equal(before.admins[0].name, "Élodie Exemple")
      assert.equal(before.leaders.length, 1); assert.equal(before.leaders[0].name, "Nicolas Exemple")
      assert(before.messages.every(m => m.eventId === eventId && m.authorId === "video-data-exports-owner" && m.authorName === "Élodie Exemple" && m.subject === "Formation — copie des résultats d'envoi"))
      for (const [index, lastName] of exportIdentityV2.lastNames.entries()) await tx.volunteer.update({ where: { id: `video-data-exports-member-${index}` }, data: { lastName, updatedAt: before.members[index].updatedAt } })
      await tx.adminUser.update({ where: { id: "video-data-exports-owner" }, data: { name: exportIdentityV2.owner, updatedAt: before.admins[0].updatedAt } })
      await tx.sectorLeader.update({ where: { id: before.leaders[0].id }, data: { name: exportIdentityV2.leader } })
      for (const message of before.messages) await tx.targetedMessage.update({ where: { id: message.id }, data: { authorName: exportIdentityV2.owner } })
      const after = await snapshot(tx as unknown as typeof runtime.db)
      const protectedBeforeSha256 = protectedExportIdentityDigest(before), protectedAfterSha256 = protectedExportIdentityDigest(after)
      assert.equal(protectedBeforeSha256, protectedAfterSha256, "Migration changed something other than approved identity fields")
      return { protectedBeforeSha256, protectedAfterSha256, authorHistoryIds: before.messages.map(m => m.id), leaderId: before.leaders[0].id }
    }, { timeout: 30000 })
    const bytes = Buffer.from(JSON.stringify({ version: 2, organizationId: org, identities: exportIdentityV2, memberIds: [0,1,2,3].map(i => `video-data-exports-member-${i}`), actionSha256, product: runtime.product, migratedAt: new Date().toISOString(), ...result, note: "Existing sent email bodies and acceptance hashes are immutable; no outbox rewrite or deletion." }, null, 2))
    await writeFile(path.join(directory, exportIdentityFile), bytes)
    await writeFile(path.join(directory, `${exportIdentityFile}.sha256`), createHash("sha256").update(bytes).digest("hex") + "\n")
    await verifyExportClassroom(runtime.db)
    console.log("✓ Exact export display identities migrated; consent, registrations, outbox, results and logs preserved byte-for-byte")
  } finally { await runtime.db.$disconnect(); await runtime.unregister() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Owned export identity migration failed"); process.exitCode = 1 })
