import { test, expect } from "@playwright/test"

/**
 * The public events page of an organization shows an editable title, "Bénévoles"
 * by default. Edited from the org settings, reflected in the h1 and <title>.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("org admin edits the public title, then restores the default", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const title = `Festival E2E ${Date.now()}`
  try {
    await page.goto("/admin/settings/admins")
    const field = page.getByLabel("Titre affiché en haut de la page de vos événements")
    await field.fill(title)
    const form = page.locator("form", { has: page.getByRole("heading", { name: "Titre de la page publique" }) })
    await form.getByRole("button", { name: "Enregistrer" }).click()
    await expect(page.getByRole("status").filter({ hasText: "Titre enregistré." })).toBeVisible()

    await page.goto("/?org=default")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title)
    await expect(page).toHaveTitle(title)
  } finally {
    await page.goto("/admin/settings/admins")
    await page.getByRole("button", { name: /Rétablir/ }).click()
    await expect(page.getByRole("status").filter({ hasText: "Titre rétabli." })).toBeVisible()
  }

  await page.goto("/?org=default")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bénévoles")
  await expect(page).toHaveTitle("Bénévoles")
})
