// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { readFile, writeFile } from "node:fs/promises"
import { parse } from "csv-parse/sync"
import { createHash } from "node:crypto"
import path from "node:path"

/** Download and reconcile real CSV bytes without modifying them or inventing history. */
async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated local video environment required")
  const directory = "videos/output/organization-activity-log"
  const prepared = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  if (prepared.organizationId !== "video-org-activity" || prepared.distinctActors !== 2) throw new Error("Actual two-session preparation required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ acceptDownloads: true })
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill("video.org-activity.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    // Give the member activity page a real registration, not an empty placeholder.
    let event = await db.event.findFirst({ where: { organizationId: prepared.organizationId, slug: "atelier-journal-organisation" } })
    if (!event) {
      const created = await page.request.post(`${base}/api/admin/events`, { data: { title: "Atelier journal organisation", startDate: "2026-10-17", endDate: "2026-10-17" } })
      if (!created.ok()) throw new Error(`Actual fixture event HTTP ${created.status()}`)
      event = await created.json()
    }
    if (!event) throw new Error("Actual fixture event missing")
    let shift = await db.shift.findFirst({ where: { eventId: event.id } })
    if (!shift) {
      const created = await page.request.post(`${base}/api/admin/shifts`, { data: { eventId: event.id, roleName: "Accueil", label: "Accueil des associations", date: "2026-10-17", startTime: "10:00", endTime: "12:00", capacity: 4 } })
      if (!created.ok()) throw new Error(`Actual fixture shift HTTP ${created.status()}`)
      shift = await created.json()
    }
    if (!shift) throw new Error("Actual fixture shift missing")
    if (!await db.registration.count({ where: { eventId: event.id, volunteerId: prepared.firstMemberId } })) {
      const member = await db.volunteer.findUniqueOrThrow({ where: { id: prepared.firstMemberId } })
      const registered = await page.request.post(`${base}/api/admin/registrations`, { data: { eventId: event.id, shiftId: shift.id, firstName: member.firstName, lastName: member.lastName, email: member.email } })
      if (!registered.ok()) throw new Error(`Actual member registration HTTP ${registered.status()}`)
    }
    await page.goto(`${base}/admin/members/${prepared.firstMemberId}`)
    await page.getByRole("heading", { name: "Activité de Aline Exemple 01", exact: true }).waitFor()
    if (!(await page.locator("ol li").allTextContents()).some(text => text.includes("Accueil"))) throw new Error("Member activity does not show the actual registration")
    await page.goto(`${base}/admin/settings/activity`)
    await page.getByLabel("Filtrer par type", { exact: true }).selectOption("AdminUser")
    await page.getByText("Colette Exemple a invité un admin", { exact: true }).waitFor()
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("link", { name: /Exporter tout le journal/ }).click()
    const download = await downloadPromise
    const file = path.join(directory, "organization-activity.csv")
    await download.saveAs(file)
    const bytes = await readFile(file)
    const [headers, ...rows] = parse(bytes, { bom: true, delimiter: ";", relax_column_count: false }) as string[][]
    const expectedHeaders = ["Date", "Acteur", "Type d'acteur", "Action", "Entité", "Identifiant", "Changements"]
    if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) throw new Error("Actual CSV columns differ")
    const list = await page.request.get(`${base}/api/admin/settings/activity`)
    let result = await list.json()
    const entries = [...result.entries]
    while (result.nextCursor) {
      const response = await page.request.get(`${base}/api/admin/settings/activity?cursor=${encodeURIComponent(result.nextCursor)}`)
      if (!response.ok()) throw new Error("Actual pagination request failed")
      result = await response.json(); entries.push(...result.entries)
    }
    const expected = entries.reverse()
    if (rows.length !== 61 || rows.length !== expected.length) throw new Error("Filtered export does not contain all 61 entries")
    rows.forEach((row, index) => {
      const entry = expected[index]
      const changes = entry.changes ? JSON.stringify(entry.changes) : ""
      if (JSON.stringify(row.slice(1)) !== JSON.stringify([entry.actorLabel, entry.actorType, entry.action, entry.entityType, entry.entityId, changes])) throw new Error(`Actual CSV row ${index + 1} differs from oldest-first API history`)
    })
    if (bytes.includes(Buffer.from("CONSigne_FICTIVE_NE_PAS_RECOPIER"))) throw new Error("Member notes copied into exported history")
    const report = { checkedAt: new Date().toISOString(), scope: "real UI download, CSV reconciliation, actual member registration; not audiovisual validation", rows: rows.length, columns: headers, distinctActors: new Set(rows.map(row => row[1])).size, allRowsDespiteAdminFilter: true, oldestFirstComparedWithFullApi: true, memberActivityHasActualRegistration: true, fileSha256: createHash("sha256").update(bytes).digest("hex"), eventId: event.id, shiftId: shift.id }
    await writeFile(path.join(directory, "export-preflight.json"), JSON.stringify(report, null, 2))
    console.log("✓ Real filtered-page download: 61 rows, 7 columns, full oldest-first API reconciliation; member activity contains a real registration")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Organization activity export check failed"); process.exitCode = 1 })
