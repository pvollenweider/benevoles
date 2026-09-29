import { test, expect } from "@playwright/test"

/**
 * Global search (#377): Ctrl+K reaches the top-bar field, Enter shows grouped results, and a result
 * leads to the matching page.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("an admin finds an event from the top-bar search", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // An event of the list (its « Gérer » link), and its title as its own page shows it. Other links
  // to an event, such as the onboarding checklist's, carry other text.
  const eventHref = await page.getByRole("link", { name: /^Gérer/ }).first().getAttribute("href")
  expect(eventHref).toMatch(/^\/admin\/events\/[^/]+$/)
  await page.goto(eventHref!)
  const title = (await page.getByRole("heading", { level: 1 }).textContent())!.trim()
  const word = title.split(/\s+/)[0]

  const field = page.getByRole("searchbox", { name: "Rechercher un bénévole, un événement ou un poste" }).first()
  // Retried: the shortcut only works once the page is hydrated.
  await expect(async () => {
    await page.keyboard.press("Control+k")
    await expect(field).toBeFocused({ timeout: 1_000 })
  }).toPass()
  await field.fill(word)
  await field.press("Enter")

  await expect(page).toHaveURL(/\/admin\/search\?q=/)
  const eventsGroup = page.getByRole("region", { name: /Événements/ })
  await expect(eventsGroup).toBeVisible()
  await eventsGroup.locator(`a[href="${eventHref}"]`).click()
  await expect(page).toHaveURL(new RegExp(`${eventHref}$`))
})
