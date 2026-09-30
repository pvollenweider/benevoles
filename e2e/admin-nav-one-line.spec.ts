import { test, expect } from "@playwright/test"

/**
 * Admin top bar at tablet and laptop widths (#495): every label stays on one line and the bar
 * doesn't overflow; the organization name gives way instead (truncated).
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

for (const width of [768, 1024]) {
  test(`admin bar labels on one line at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000) // dev server compiles each page on first visit
    await page.setViewportSize({ width, height: 800 })
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    const nav = page.getByRole("navigation", { name: "Navigation de l'administration" })
    expect(await nav.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    for (const label of ["Tableau de bord", "Événements", "Membres", "Paramètres"]) {
      const link = nav.getByRole("link", { name: label, exact: true })
      await expect(link).toBeVisible()
      // One line: its height is a single line box of its own font.
      const [height, lineHeight] = await link.evaluate((el) => [el.getBoundingClientRect().height, parseFloat(getComputedStyle(el).lineHeight)])
      expect(height).toBeLessThan(lineHeight * 1.5)
    }
  })
}
