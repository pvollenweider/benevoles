import { test, expect } from "@playwright/test"

/**
 * « Prévisualiser comme un bénévole » (#370): from an event's admin page, the public page as
 * volunteers see it, with the preview banner, and a way back.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("an admin previews an event as a volunteer and comes back", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // First event of the list.
  await page.locator('a[href^="/admin/events/"]:not([href$="/new"])').first().click()
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
  const eventUrl = page.url()

  await page.getByRole("link", { name: "Prévisualiser comme un bénévole" }).click()
  await expect(page).toHaveURL(/\/preview$/)
  await expect(page.getByText(/la page telle que la verront les bénévoles/)).toBeVisible()
  await expect(page.locator("h1").last()).toBeVisible()

  await page.getByRole("link", { name: "Retour à l'événement" }).click()
  await expect(page).toHaveURL(eventUrl)
})
