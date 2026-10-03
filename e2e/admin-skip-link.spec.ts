import { test, expect } from "@playwright/test"

/**
 * Skip link (#389): the first Tab on an admin page reveals « Aller au contenu »; Enter moves the
 * focus to the main landmark, past the top bar.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test("the first Tab reveals a skip link that focuses the main content", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // Fresh load so nothing on the page holds the focus.
  await page.goto("/admin/events")
  const link = page.getByRole("link", { name: "Aller au contenu" })
  await expect(link).not.toBeInViewport()
  await page.keyboard.press("Tab")
  await expect(link).toBeFocused()
  await expect(link).toBeVisible()

  await page.keyboard.press("Enter")
  await expect(page.locator("main#main")).toBeFocused()
})

// The operator's space has the same top bar, so the same skip link (#534).
test("super admin: the first Tab reveals a skip link that focuses the main content", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin/)

  await page.goto("/super-admin/organizations")
  const link = page.getByRole("link", { name: "Aller au contenu" })
  await expect(link).toHaveCount(1)
  await expect(link).not.toBeInViewport()
  await page.keyboard.press("Tab")
  await expect(link).toBeFocused()
  await expect(link).toBeVisible()

  await page.keyboard.press("Enter")
  await expect(page.locator("main#main")).toBeFocused()
})
