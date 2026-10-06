// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Real local server refusals and response-loss simulation, never fabricated UI. */
import assert from "node:assert/strict"
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

async function main() {
  assert.equal(process.env.VIDEO_BASE_URL, "http://localhost:43102")
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(url.hostname === "localhost" && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  const orgId = "video-errors", eventId = `${orgId}-event`
  const directory = path.resolve("videos/output/volunteer-confirmation-errors/server-preflight")
  await mkdir(directory, { recursive: true })
  const browser = await chromium.launch()
  try {
    const existing = await db.organization.findUnique({ where: { id: orgId } })
    if (!existing) {
      const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
      const day = new Date("2026-11-14T00:00:00Z")
      await db.$transaction(async tx => {
        await tx.organization.create({ data: { id: orgId, slug: "formation-erreurs", name: "Formation — inscription robuste", timeZone: "Europe/Zurich", active: true, hasOrgInsurance: true, replyToEmail: "video.errors.owner@example.org" } })
        await tx.adminUser.create({ data: { id: `${orgId}-owner`, organizationId: orgId, email: "video.errors.owner@example.org", name: "Élodie Exemple", role: "admin", isActive: true, passwordHash: source.passwordHash } })
        await tx.volunteer.create({ data: { id: `${orgId}-aline`, organizationId: orgId, firstName: "Aline", lastName: "Exemple", email: "video.errors.aline@example.org", active: true } })
        await tx.event.create({ data: { id: eventId, organizationId: orgId, slug: "atelier-inscription", title: "Inscription robuste — démonstration", description: "Données fictives de formation uniquement.", startDate: day, endDate: day, publicStatus: "published", isListed: false, remindersEnabled: false } })
        for (const [index, [roleName, startTime, endTime]] of [["Accueil", "10:00", "12:00"], ["Vestiaire", "11:00", "13:00"], ["Logistique", "14:00", "16:00"]].entries()) await tx.shift.create({ data: { id: `${orgId}-shift-${index}`, eventId, roleName, label: `${roleName} — démonstration`, date: day, startTime, endTime, capacity: 3, status: "open", displayOrder: index } })
        await tx.registration.create({ data: { id: `${orgId}-initial`, eventId, shiftId: `${orgId}-shift-0`, volunteerId: `${orgId}-aline`, status: "active", source: "admin_manual", ...registrationToken.data("demo-errors-aline-initial") } })
      })
    } else assert(existing.slug === "formation-erreurs" && existing.name === "Formation — inscription robuste", "Existing organization belongs to another namespace")
    assert.equal(await db.registration.count({ where: { eventId } }), 1, "Fresh preflight required; refusing to remove prior registrations")
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const openForm = async (role: string, firstName: string, email: string) => {
      await page.goto("http://localhost:43102/atelier-inscription?org=formation-erreurs")
      await page.getByRole("heading", { name: "Inscription robuste — démonstration", exact: true }).waitFor()
      await page.getByRole("button", { name: new RegExp(`^Sélectionner — ${role}`) }).click()
      await page.getByRole("button", { name: /^Continuer/ }).click()
      await page.getByLabel("Prénom *", { exact: true }).fill(firstName)
      await page.getByLabel("Nom *", { exact: true }).fill("Exemple")
      await page.getByLabel("Email *", { exact: true }).fill(email)
      const size = page.getByRole("radio", { name: "M", exact: true })
      if (await size.count()) await size.check()
      await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox").check()
      await page.locator("label").filter({ hasText: "J'accepte que l'association" }).getByRole("checkbox").check()
    }
    const submit = page.getByRole("button", { name: "Confirmer mon inscription", exact: true })
    await openForm("Vestiaire", "Aline", "video.errors.aline@example.org")
    const overlapResponse = page.waitForResponse(response => response.url().endsWith("/api/public/registrations") && response.request().method() === "POST")
    await submit.click()
    const overlap = await overlapResponse
    assert.equal(overlap.status(), 409)
    const overlapBody = await overlap.json()
    assert(/chevauch|déjà.*créneau|horaire/i.test(overlapBody.error))
    await page.locator('[role="alert"]').first().waitFor()
    await page.screenshot({ path: path.join(directory, "actual-server-overlap.png"), fullPage: true })
    assert.equal(await db.registration.count({ where: { eventId } }), 1)
    await openForm("Logistique", "Nicolas", "video.errors.nicolas@example.org")
    let committedStatus: number | null = null
    await page.route("**/api/public/registrations", async route => {
      // Forward the real request first; only its browser-visible response is lost.
      const response = await route.fetch()
      committedStatus = response.status()
      await route.abort("internetdisconnected")
    })
    await submit.click()
    await page.getByText("Connexion interrompue", { exact: true }).waitFor()
    assert.equal(committedStatus, 201)
    const created = await db.registration.findMany({ where: { eventId, volunteer: { email: "video.errors.nicolas@example.org" } } })
    assert.equal(created.length, 1)
    await page.screenshot({ path: path.join(directory, "response-lost-after-commit.png"), fullPage: true })
    await page.unroute("**/api/public/registrations")
    const retryResponse = page.waitForResponse(response => response.url().endsWith("/api/public/registrations") && response.request().method() === "POST")
    await submit.click()
    const retry = await retryResponse
    assert.equal(retry.status(), 409)
    const retryBody = await retry.json()
    assert(/déjà inscrit/i.test(retryBody.error))
    assert.equal((await db.registration.findMany({ where: { eventId, volunteer: { email: "video.errors.nicolas@example.org" } } })).length, 1)
    await page.screenshot({ path: path.join(directory, "retry-without-duplicate.png"), fullPage: true })
    await page.goto("http://localhost:43102/admin/login")
    await page.getByLabel("Email", { exact: true }).fill("video.errors.owner@example.org")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto(`http://localhost:43102/admin/events/${eventId}/registrations`)
    assert.equal(await page.getByRole("row").filter({ hasText: "video.errors.nicolas@example.org" }).count(), 1)
    await page.screenshot({ path: path.join(directory, "single-registration-result.png"), fullPage: true })
    await writeFile(path.join(directory, "proof.json"), JSON.stringify({ checkedAt: new Date().toISOString(), organizationId: orgId, eventId, actualOverlapStatus: overlap.status(), overlapError: overlapBody.error, firstRequestCommittedStatus: committedStatus, responseLossSimulatedAfterCommit: true, retryStatus: retry.status(), retryError: retryBody.error, singleRegistrationBeforeAndAfterRetry: true, actualOrganizerRowCount: 1, audiovisualValidated: false }, null, 2))
    console.log("✓ Actual server overlap refused; real signup committed before simulated response loss; retry created no duplicate; single registration visible to organizer")
  } finally { await browser.close(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Registration-errors preflight failed"); process.exitCode = 1 })
