import { test, expect } from "@playwright/test"
import { createHash, randomBytes } from "node:crypto"
import { Client } from "pg"

/**
 * « Conserver mon organisation » (#811): the link of the periodic check's emails opens a page that
 * changes nothing until its button is pressed; the press keeps the space and stops the procedure;
 * the link then no longer works. The procedure state and the link are set directly in the DB (the
 * nightly run that creates them is covered by the integration tests). Raw `pg`: the generated
 * Prisma client is ESM-only, which Playwright's TypeScript loader cannot run.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

async function sql(query: string, params: unknown[]) {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    return (await db.query(query, params)).rows
  } finally {
    await db.end()
  }
}

test("an administrator keeps the space with the emailed link, once", async ({ page, browser }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

  const slug = `e2e-keep-${Date.now()}`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail: `${slug}-admin@example.com`, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()
  const [admin] = await sql(`SELECT id FROM "AdminUser" WHERE email = $1`, [`${slug}-admin@example.com`])
  await sql(`UPDATE "Organization" SET "inactivityNoticeAt" = now(), "inactivityEmailsSent" = 1 WHERE id = $1`, [org.id])
  const secret = randomBytes(32).toString("hex")
  await sql(
    `INSERT INTO "OrgKeepLink" (id, "tokenHash", "organizationId", "adminUserId", "expiresAt") VALUES ($1, $2, $3, $4, now() + interval '75 days')`,
    [`e2e-${slug}`, createHash("sha256").update(secret, "utf8").digest("hex"), org.id, admin.id],
  )

  const anonymous = await browser.newContext()
  const visitor = await anonymous.newPage()
  const path = `/admin/keep?${new URLSearchParams({ token: secret })}`
  await visitor.goto(path)
  await expect(visitor.getByRole("heading", { level: 1, name: "Conserver mon organisation" })).toBeVisible()
  // Opening the link changed nothing.
  expect((await sql(`SELECT "inactivityEmailsSent" FROM "Organization" WHERE id = $1`, [org.id]))[0].inactivityEmailsSent).toBe(1)

  await visitor.getByRole("button", { name: "Conserver mon organisation" }).click()
  await expect(visitor.getByRole("heading", { name: "C'est noté, merci" })).toBeFocused()
  const [row] = await sql(`SELECT "inactivityNoticeAt", "inactivityEmailsSent", "lastRetentionConfirmedAt" IS NOT NULL AS confirmed FROM "Organization" WHERE id = $1`, [org.id])
  expect(row).toEqual({ inactivityNoticeAt: null, inactivityEmailsSent: 0, confirmed: true })

  // Single use.
  await visitor.goto(path)
  await expect(visitor.getByRole("heading", { name: "Lien expiré ou déjà utilisé" })).toBeVisible()
  await expect(visitor.getByRole("link", { name: "Réactiver un espace désactivé" })).toBeVisible()
  await anonymous.close()

  expect((await page.request.patch(`/api/super-admin/organizations/${org.id}`, { data: { active: false } })).ok()).toBeTruthy()
  expect((await page.request.delete(`/api/super-admin/organizations/${org.id}`, { data: { confirmSlug: org.slug } })).ok()).toBeTruthy()
})
