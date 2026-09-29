import { test, expect } from "@playwright/test"

/**
 * Admin top bar on a phone-sized screen (#361): nothing overflows horizontally, the links are
 * reachable through the "Menu" button, and the user menu stays on screen.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test.use({ viewport: { width: 375, height: 740 } })

test("every admin destination and the user menu are reachable on a small screen", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const nav = page.getByRole("navigation", { name: "Navigation de l'administration" })
  // No horizontal overflow of the bar.
  const overflow = await nav.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // User menu on screen and usable, even with the seed's long name (truncated on screen).
  const userButton = nav.getByRole("button", { name: "Administrateur (org par défaut)" })
  await expect(userButton).toBeInViewport()
  await userButton.click()
  await expect(page.getByRole("menuitem", { name: "Mon compte" })).toBeInViewport()
  await page.keyboard.press("Escape")

  // Links behind "Menu".
  const toggle = nav.getByRole("button", { name: "Menu" })
  await expect(toggle).toBeVisible()
  await toggle.click()
  for (const label of ["Tableau de bord", "Événements", "Membres", "Paramètres"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeInViewport()
  }
  await nav.getByRole("link", { name: "Membres", exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/members/)
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
})
