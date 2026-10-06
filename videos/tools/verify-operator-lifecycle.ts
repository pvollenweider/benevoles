// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real-route rehearsal on one explicitly disposable synthetic organization. */
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

async function main() {
  const base = "http://localhost:43104"
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "45433" || url.pathname !== "/benevoles_video_operator" || process.env.VIDEO_BASE_URL !== base) throw new Error("Isolated operator environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
  const browser = await chromium.launch()
  try {
    const email = "video.operator.disposable.owner@example.org"
    const cleanup = await db.organization.findFirst({ where: { slug: "formation-operateur-jetable-renommee", name: "Formation Opérateur Jetable renommée", active: false, admins: { some: { email } } }, select: { id: true, slug: true, _count: { select: { admins: true, events: true, volunteers: true } } } })
    const resume = await db.organization.findFirst({ where: { slug: "formation-operateur-jetable", name: "Formation Opérateur Jetable", admins: { some: { email, isActive: false } } }, select: { id: true } })
    const organizations = await db.organization.findMany({ select: { id: true } })
    assert.equal(organizations.length, resume || cleanup ? 4 : 3)
    assert(organizations.every(org => /^video-operator-org-[abc]$/.test(org.id) || org.id === resume?.id || org.id === cleanup?.id))
    const platform = await browser.newPage(), pending = await browser.newPage()
    const password = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
    const activationPassword = "Formation-Operator-2026!"
    async function login(page: typeof platform, email: string, loginPassword = password) {
      await page.goto(`${base}/admin/login`)
      await page.getByLabel("Email", { exact: true }).fill(email)
      await page.getByLabel("Mot de passe", { exact: true }).fill(loginPassword)
      await page.getByRole("button", { name: "Se connecter", exact: true }).click()
      await page.waitForURL(/\/(?:admin\/events|super-admin\/organizations)/)
    }
    await login(platform, "video.operator.platform@example.org")
    if (cleanup) {
      assert.deepEqual(cleanup._count, { admins: 1, events: 0, volunteers: 0 })
      assert.equal((await platform.request.delete(`${base}/api/super-admin/organizations/${cleanup.id}`, { data: { confirmSlug: cleanup.slug } })).status(), 200, "Remove only exact disposable inactive rehearsal organization")
    }
    if (!resume) {
      assert.equal(await db.adminUser.count({ where: { email } }), 0)
      const created = await platform.request.post(`${base}/api/super-admin/organizations`, { data: { name: "Formation Opérateur Jetable", adminName: "Lou Exemple", adminEmail: email } })
      assert.equal(created.status(), 201)
      assert.equal(typeof (await created.json()).inviteUrl, "string")
    }
    const org = await db.organization.findFirstOrThrow({ where: { admins: { some: { email } } }, select: { id: true, slug: true, name: true } })
    assert.equal(org.name, "Formation Opérateur Jetable")
    const admin = await db.adminUser.findUniqueOrThrow({ where: { email }, select: { id: true, isActive: true } })
    assert.equal(admin.isActive, false)
    async function renew() {
      const response = await platform.request.post(`${base}/api/super-admin/organizations/${org.id}/send-invite`, { data: { adminId: admin.id } })
      assert.equal(response.status(), 200)
      const body = await response.json()
      assert.equal(body.sent, true, "Local SMTP really accepted the invitation")
      assert.equal(body.email, email)
      return new URL(body.inviteUrl).searchParams.get("token")!
    }
    const first = await renew(), second = await renew()
    assert(first && second && first !== second)
    assert.equal((await pending.request.get(`${base}/api/admin/accept-invite`, { params: { token: first } })).status(), 404)
    assert.equal((await pending.request.get(`${base}/api/admin/accept-invite`, { params: { token: second } })).status(), 200)
    assert.equal((await pending.request.post(`${base}/api/admin/accept-invite`, { data: { token: second, password: activationPassword } })).status(), 200, "Activate with a password satisfying the real policy")
    assert.equal((await pending.request.get(`${base}/api/admin/accept-invite`, { params: { token: second } })).status(), 404)
    await login(pending, email, activationPassword)
    assert.equal((await pending.request.get(`${base}/api/admin/events`)).status(), 200)
    const endpoint = `${base}/api/super-admin/organizations/${org.id}`
    assert.equal((await platform.request.patch(endpoint, { data: { slug: "formation-operateur-a" } })).status(), 409)
    assert.equal((await platform.request.patch(endpoint, { data: { name: "Formation Opérateur Jetable renommée", slug: "formation-operateur-jetable-renommee" } })).status(), 200)
    assert.equal(await db.orgSlugHistory.count({ where: { organizationId: org.id, slug: org.slug } }), 1)
    assert.equal((await platform.request.delete(endpoint, { data: { confirmSlug: "formation-operateur-jetable-renommee" } })).status(), 409, "Active organization cannot be deleted")
    assert.equal((await platform.request.patch(endpoint, { data: { active: false } })).status(), 200)
    const inactiveStatus = (await pending.request.get(`${base}/api/admin/events`)).status()
    assert.equal(inactiveStatus, 401, "Inactive organization invalidates the existing owner session")
    assert.equal((await platform.request.patch(endpoint, { data: { active: true } })).status(), 200)
    assert.equal((await pending.request.get(`${base}/api/admin/events`)).status(), 200)
    assert.equal((await platform.request.patch(endpoint, { data: { active: false } })).status(), 200)
    assert.equal((await platform.request.delete(endpoint, { data: { confirmSlug: "wrong-fixture-slug" } })).status(), 400)
    // Exact ownership was verified above; only the new disposable organization is removed.
    assert.equal((await platform.request.delete(endpoint, { data: { confirmSlug: "formation-operateur-jetable-renommee" } })).status(), 200)
    assert.equal(await db.organization.count(), 3)
    assert.equal(await db.adminUser.count({ where: { email } }), 0)
    const directory = "videos/output/platform-internal-administration"
    await mkdir(directory, { recursive: true })
    await writeFile(`${directory}/lifecycle-preparation.json`, JSON.stringify({ checkedAt: new Date().toISOString(), evidence: "Real API actions in isolated local database; not filmed UI validation", createdPendingAccount: true, twoInvitationsAcceptedByLocalSmtp: true, oldLinkRefused: true, newLinkActivatedAndConsumed: true, actualOwnerLogin: true, occupiedSlugStatus: 409, oldSlugStoredInHistory: true, activeDeletionStatus: 409, existingSessionWhileInactiveStatus: inactiveStatus, existingSessionAfterReactivationStatus: 200, wrongDeletionChallengeStatus: 400, disposableOrganizationDeleted: true, originalOrganizationsRemaining: 3, publicRedirectStillToCheck: true }, null, 2))
    console.log("✓ Real disposable creation, invitation rotation, activation, slug collision/history, disable/re-enable and guarded deletion; original three organizations preserved")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operator lifecycle preflight failed"); process.exitCode = 1 })
