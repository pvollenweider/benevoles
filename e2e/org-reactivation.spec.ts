import { test, expect } from "@playwright/test"
import { Client } from "pg"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * « Réactiver mon espace » (#811): from the sign-in page, an administrator of a space deactivated
 * for inactivity asks for a link, receives it (Mailpit), and reactivates the space with the link
 * page's button; the link works once. The deactivation itself is set directly in the DB (the
 * periodic check that sets it ships separately). Raw `pg`: the generated Prisma client is
 * ESM-only, which Playwright's TypeScript loader cannot run.
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

test("an administrator reactivates a space deactivated for inactivity with the emailed link, once", async ({ page, browser }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

  const slug = `e2e-reactivation-${Date.now()}`
  const adminEmail = `${slug}-admin@example.com`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()
  await sql(`UPDATE "AdminUser" SET "isActive" = true WHERE email = $1`, [adminEmail])
  await sql(`UPDATE "Organization" SET active = false, "inactivityDeactivatedAt" = now() WHERE id = $1`, [org.id])

  const anonymous = await browser.newContext()
  const visitor = await anonymous.newPage()
  await visitor.goto("/admin/login")
  await visitor.getByRole("link", { name: "Espace désactivé faute d'activité ? Le réactiver" }).click()
  await expect(visitor.getByRole("heading", { level: 1, name: "Réactiver mon espace" })).toBeVisible()
  await visitor.getByLabel("Email").fill(adminEmail)
  await visitor.getByRole("button", { name: "Recevoir le lien" }).click()
  await expect(visitor.getByRole("heading", { name: "Demande envoyée" })).toBeFocused()

  const message = await waitForMessage(`to:${adminEmail} subject:"Réactiver l'espace"`)
  const text = await getMessageText(message.ID)
  const link = new URL(text.match(/https?:\/\/\S+\/admin\/reactivate\/confirm\?\S+/)![0])
  const path = `${link.pathname}${link.search}`

  await visitor.goto(path)
  await expect(visitor.getByText(`L'espace de ${slug} a été désactivé faute d'activité.`)).toBeVisible()
  await visitor.getByRole("button", { name: "Réactiver l'espace" }).click()
  await expect(visitor.getByRole("heading", { name: "Espace réactivé" })).toBeFocused()
  const [row] = await sql(`SELECT active, "inactivityDeactivatedAt" FROM "Organization" WHERE id = $1`, [org.id])
  expect(row).toEqual({ active: true, inactivityDeactivatedAt: null })

  // Single use.
  await visitor.goto(path)
  await expect(visitor.getByText("Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.")).toBeVisible()
  await anonymous.close()

  expect((await page.request.patch(`/api/super-admin/organizations/${org.id}`, { data: { active: false } })).ok()).toBeTruthy()
  expect((await page.request.delete(`/api/super-admin/organizations/${org.id}`, { data: { confirmSlug: org.slug } })).ok()).toBeTruthy()
})
