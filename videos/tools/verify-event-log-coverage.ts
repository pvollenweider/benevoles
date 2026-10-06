// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Read-only coverage check; never permits an external audiovisual upload. */
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video", "Dedicated local video database required")
  const directory = path.resolve("videos/output/event-activity-log")
  const preparation = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  try {
    const events = await db.event.findMany({ where: { id: { in: [preparation.eventId, preparation.baselineWitnessId] } }, include: { registrations: { include: { volunteer: true } } } })
    assert.equal(events.length, 2)
    for (const event of events) {
      assert(event.organizationId === "default" && ["atelier-journal", "atelier-journal-etat-initial"].includes(event.slug) && event.description?.startsWith("Données fictives de formation."))
      assert(event.registrations.every(reg => /^video-event-log-person-[0-2]$/.test(reg.volunteerId) && /^video\.event-log\.[0-2]@example\.org$/.test(reg.volunteer.email ?? "") && reg.volunteer.lastName === "Exemple" && !reg.volunteer.phone))
    }
    const logs = await db.eventLog.findMany({ where: { eventId: preparation.eventId }, orderBy: { createdAt: "asc" } })
    assert(logs.length > 50, "Real pagination data required")
    const spanHours = (logs.at(-1)!.createdAt.getTime() - logs[0].createdAt.getTime()) / 3_600_000
    const root = logs.find(log => log.id === preparation.rootLogId)
    assert(root && logs.some(log => log.causedByLogId === root.id), "Recorded causal chain must still exist")
    const baseline = await db.eventLog.findMany({ where: { eventId: preparation.baselineWitnessId } })
    assert(baseline.length === 3 && baseline.every(log => log.action.endsWith(".baseline")))
    const report = { checkedAt: new Date().toISOString(), syntheticEventRegistrationsVerified: true, entries: logs.length, paginationAvailable: true, causalChainPresent: true, baselineEntries: baseline.length, historicalSpanHours: spanHours, twoWeekHistoryCovered: spanHours >= 14 * 24, externalUploadAuthorized: false, note: "Read-only local coverage evidence, not audiovisual validation or a full synthetic-data export guard" }
    await writeFile(path.join(directory, "coverage-check.json"), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Coverage check failed"); process.exitCode = 1 })
