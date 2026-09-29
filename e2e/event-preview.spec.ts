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

  // An event page from the list (not /new, and not a sub-page such as the checklist's /shifts link).
  const hrefs = await page.locator('a[href^="/admin/events/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))
  const eventHref = hrefs.find((h) => /^\/admin\/events\/[^/]+$/.test(h) && h !== "/admin/events/new")
  expect(eventHref).toBeTruthy()
  await page.goto(eventHref!)
  const eventUrl = page.url()

  await page.getByRole("link", { name: "Prévisualiser comme un bénévole" }).click()
  await expect(page).toHaveURL(/\/preview$/)
  await expect(page.getByText(/la page telle que la verront les bénévoles/)).toBeVisible()
  await expect(page.locator("h1").last()).toBeVisible()

  await page.getByRole("link", { name: "Retour à l'événement" }).click()
  await expect(page).toHaveURL(eventUrl)
})
