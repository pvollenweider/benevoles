// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"

/** Actual actions by two distinct local sessions; no inserted OrgLog rows. */
async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video environment required")
  const organizationId = "video-org-activity"
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    if (await db.orgLog.count({ where: { organizationId } }) || await db.volunteer.count({ where: { organizationId } })) throw new Error("Fresh organization-activity-log seed required")
    const contexts = await Promise.all([browser.newContext(), browser.newContext()])
    const pages = await Promise.all(contexts.map(c => c.newPage()))
    for (const [index, page] of pages.entries()) {
      await page.goto(`${base}/admin/login`)
      await page.getByLabel("Email", { exact: true }).fill(`video.org-activity.${index ? "organizer" : "owner"}@example.org`)
      await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter", exact: true }).click()
      await page.waitForURL(/\/admin\/events/)
    }
    const names = ["Aline", "Nicolas", "Léa", "Camille", "Noah", "Sarah", "Emma", "Lucas"]
    const ids: string[] = []
    for (let index = 0; index < 56; index++) {
      const response = await pages[index % 2].request.post(`${base}/api/admin/members`, { data: { firstName: names[index % names.length], lastName: `Exemple ${String(index + 1).padStart(2, "0")}`, email: `video.org-activity.member.${index}@example.org`, phone: `+41 79 000 ${String(index).padStart(4, "0")}` } })
      if (!response.ok()) throw new Error(`Actual member creation ${index}: HTTP ${response.status()}`)
      ids.push((await response.json()).id)
    }
    const edited = await pages[1].request.patch(`${base}/api/admin/members/${ids[0]}`, { data: { phone: "+41 79 000 9900", notes: "CONSigne_FICTIVE_NE_PAS_RECOPIER" } })
    const deactivated = await pages[0].request.patch(`${base}/api/admin/members/${ids[1]}`, { data: { active: false } })
    if (!edited.ok() || !deactivated.ok()) throw new Error("Actual member modification/deactivation failed")
    const invited = await pages[0].request.post(`${base}/api/admin/settings/admins`, { data: { name: "Alex Exemple", email: "video.org-activity.invited@example.org", role: "organizer" } })
    if (!invited.ok()) throw new Error(`Actual admin invitation HTTP ${invited.status()}`)
    const invitedId = (await invited.json()).id as string
    const changed = await pages[0].request.patch(`${base}/api/admin/settings/admins/${invitedId}`, { data: { role: "admin" } })
    if (!changed.ok()) throw new Error(`Actual role change HTTP ${changed.status()}`)
    const notifications = await pages[0].request.patch(`${base}/api/admin/settings/notifications`, { data: { settings: { reminders: { j1: false } } } })
    if (!notifications.ok()) throw new Error(`Actual notification setting HTTP ${notifications.status()}`)
    const all = await db.orgLog.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } })
    const actors = new Set(all.map(log => log.actorId))
    const expected = ["member.created", "member.updated", "member.deactivated", "adminuser.invited", "adminuser.role_changed", "organization.notifications_updated"]
    if (all.length !== 61 || actors.size !== 2 || expected.some(action => !all.some(log => log.action === action)) || JSON.stringify(all).includes("CONSigne_FICTIVE_NE_PAS_RECOPIER")) throw new Error("Actual collaborative journal or privacy invariants failed")
    const list = await pages[0].request.get(`${base}/api/admin/settings/activity`)
    const first = await list.json()
    if (!list.ok() || first.entries?.length !== 50 || !first.nextCursor) throw new Error("Real organization activity pagination missing")
    const report = { preparedAt: new Date().toISOString(), scope: "actual local routes and two distinct sessions; no audiovisual validation", organizationId, members: ids.length, firstMemberId: ids[0], inactiveMemberId: ids[1], invitedAdminId: invitedId, journalEntries: all.length, distinctActors: actors.size, actions: expected, firstPageEntries: first.entries.length, nextPageAvailable: true, sensitiveMemberValuesNotCopied: true }
    await mkdir("videos/output/organization-activity-log", { recursive: true })
    await writeFile("videos/output/organization-activity-log/preparation.json", JSON.stringify(report, null, 2))
    console.log("✓ Two actual sessions: 56 members, modification/deactivation, invitation/role change, notification setting; 61 real journal entries and pagination")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Organization activity preparation failed"); process.exitCode = 1 })
