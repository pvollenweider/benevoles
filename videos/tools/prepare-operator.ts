// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Read-only checks with real logins, before any operator demo mutations. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "45433" || url.pathname !== "/benevoles_video_operator" || process.env.VIDEO_BASE_URL !== "http://localhost:43104") throw new Error("Isolated operator video environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
  const browser = await chromium.launch()
  try {
    const platform = await browser.newPage(), owner = await browser.newPage(), anonymous = await browser.newPage()
    for (const [page, email] of [[platform, "video.operator.platform@example.org"], [owner, "video.operator.a.owner@example.org"]] as const) {
      await page.goto("http://localhost:43104/admin/login")
      await page.getByLabel("Email", { exact: true }).fill(email)
      await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
      await page.getByRole("button", { name: "Se connecter", exact: true }).click()
      await page.waitForURL(/\/(?:admin\/events|super-admin\/organizations)/)
    }
    await platform.goto("http://localhost:43104/super-admin/organizations")
    await platform.getByRole("heading", { name: "Organisations", exact: true }).waitFor()
    const listed = await platform.request.get("http://localhost:43104/api/super-admin/organizations")
    assert.equal(listed.status(), 200)
    const organizations = await listed.json()
    assert.equal(organizations.length, 3)
    assert(organizations.every((org: { id: string; name: string }) => /^video-operator-org-[abc]$/.test(org.id) && /^Formation Opérateur /.test(org.name)))
    assert.equal(organizations.filter((org: { active: boolean }) => !org.active).length, 1)
    assert.equal((await platform.request.get("http://localhost:43104/api/admin/events")).status(), 409, "No implicit organization context")
    assert.equal((await owner.request.get("http://localhost:43104/api/super-admin/organizations")).status(), 403, "Owner cannot administer the platform")
    assert.equal((await anonymous.request.get("http://localhost:43104/api/super-admin/organizations")).status(), 401, "Anonymous platform request refused")
    assert.equal((await owner.request.get("http://localhost:43104/api/admin/events/video-operator-org-b-event-0")).status(), 404, "Owner cannot read the other organization")
    await platform.goto("http://localhost:43104/api/super-admin/use-org/video-operator-org-a")
    await platform.waitForURL(/\/admin\/events/)
    await platform.getByRole("link", { name: "Parc — Fête de formation", exact: true }).waitFor()
    const selected = await platform.request.get("http://localhost:43104/api/admin/events")
    assert.equal(selected.status(), 200)
    await platform.goto("http://localhost:43104/super-admin/health")
    await platform.getByRole("heading", { name: "Santé du service", exact: true }).waitFor()
    for (const name of ["Service", "Tâches planifiées et sauvegardes", "Configuration"]) await platform.getByRole("heading", { name, exact: true }).waitFor()
    assert.equal(await db.jobRun.count(), 0, "No invented scheduled-job or backup successes")
    assert.equal(await db.adminUser.count({ where: { isActive: true, receiveProductUpdates: true } }), 1)
    const recipients = await db.adminUser.findMany({ where: { isActive: true, receiveProductUpdates: true }, select: { email: true } })
    assert.deepEqual(recipients, [{ email: "video.operator.a.owner@example.org" }])
    const directory = "videos/output/platform-internal-administration"
    await mkdir(directory, { recursive: true })
    await writeFile(`${directory}/preparation.json`, JSON.stringify({ checkedAt: new Date().toISOString(), organizations: organizations.map((org: { id: string; active: boolean; _count: unknown }) => ({ id: org.id, active: org.active, counts: org._count })), actualPlatformLogin: true, actualOwnerLogin: true, unselectedContextStatus: 409, ownerPlatformStatus: 403, anonymousPlatformStatus: 401, crossOrganizationStatus: 404, explicitOrganizationSelection: true, healthPageReal: true, noInventedHeartbeats: true, subscribedActiveRecipients: recipients }, null, 2))
    console.log("✓ Real operator/owner logins, 3 synthetic organizations, explicit context, scoped refusals and actual health page; 1 isolated broadcast recipient")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operator preparation failed"); process.exitCode = 1 })
