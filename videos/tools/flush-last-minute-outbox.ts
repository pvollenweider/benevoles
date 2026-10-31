// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Off-screen elapsed-time preparation; the actual compiled cron sends every email. */
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { writeFile } from "node:fs/promises"
import { openPayload } from "../../src/lib/notifications/outbox"
import { verifyProductBuild } from "../lib/product-build"
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const product = await verifyProductBuild("http://localhost:43102")
  const db = new PrismaClient({ adapter: pgAdapter(url.href) })
  const heldUntil = new Date(Date.now() + 3600000)
  const held: { id: string; nextAttemptAt: Date }[] = []
  try {
    const org = await db.organization.findUniqueOrThrow({ where: { id: "video-last-minute" } })
    assert(org.name === "Formation — imprévus" && org.slug === "formation-imprevus")
    const pending = (await db.notificationOutbox.findMany({ where: { status: "pending" } })).map(row => ({ ...row, recipient: openPayload(row.payload).recipient.email ?? "" }))
    assert(pending.every(row => row.recipient.endsWith("@example.org") || ["admin@localhost", "org-admin@localhost"].includes(row.recipient)), "Unknown recipient in isolated cron queue")
    const own = pending.filter(row => row.organizationId === org.id)
    assert(own.every(row => /^video\.last-minute\.(?:person\.[0-5]|owner)@example\.org$/.test(row.recipient)))
    // Prevent the global cron from delivering another take's pending examples.
    // Restore those exact due dates even if the real route fails.
    for (const row of pending.filter(row => row.organizationId !== org.id && row.nextAttemptAt <= new Date())) {
      const result = await db.notificationOutbox.updateMany({ where: { id: row.id, status: "pending", nextAttemptAt: row.nextAttemptAt }, data: { nextAttemptAt: heldUntil } })
      assert.equal(result.count, 1); held.push({ id: row.id, nextAttemptAt: row.nextAttemptAt })
    }
    for (const row of own) await db.notificationOutbox.updateMany({ where: { id: row.id, organizationId: org.id, status: "pending", nextAttemptAt: row.nextAttemptAt }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
    const response = await fetch("http://localhost:43102/api/cron/outbox", { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? "local-video-fixture-cron-only"}` } })
    assert(response.ok, `Actual outbox cron HTTP ${response.status}`)
    const result = await response.json()
    const after = await db.notificationOutbox.findMany({ where: { id: { in: own.map(row => row.id) } } })
    assert(after.every(row => row.status === "sent"), "Actual cron delivery incomplete")
    await writeFile(`videos/output/last-minute-changes/outbox-cron-${Date.now()}.json`, JSON.stringify({ product, at: new Date().toISOString(), note: "Off-screen few-minutes ellipse: only nextAttemptAt changed; real compiled cron/SMTP delivery, no fabricated payload/status/attempt count", dueIds: own.map(row => row.id), temporarilyHeldOtherFixtureIds: held.map(row => row.id), actualCronResult: result }, null, 2))
    console.log(`Actual compiled cron delivered ${own.length} newly due last-minute notifications; unrelated due dates restored`)
  } finally {
    for (const row of held) { const result = await db.notificationOutbox.updateMany({ where: { id: row.id, status: "pending", nextAttemptAt: heldUntil }, data: { nextAttemptAt: row.nextAttemptAt } }); assert.equal(result.count, 1) }
    await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
