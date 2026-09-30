import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * Automated accessibility checks on the critical paths (#487), as listed on /accessibilite:
 * no serious or critical axe-core violation. Keyboard and screen-reader checks stay manual.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test.describe("public pages", () => {
  for (const path of ["/fonctionnalites", "/doc", "/doc/benevole", "/accessibilite", "/legal/privacy"]) {
    test(`${path} has no serious violation`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect.soft(await seriousViolations(page)).toEqual([])
    })
  }

  test("event page, then the sign-up form, have no serious violation", async ({ page }) => {
    await page.goto("/spectacle-cirque-2026?org=default")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page)).toEqual([])
    await page.getByRole("button", { name: /Sélectionner.*Billetterie/ }).first().click()
    await page.getByRole("button", { name: /^Continuer/ }).click()
    await expect(page.getByLabel("Prénom *", { exact: true })).toBeVisible()
    expect.soft(await seriousViolations(page)).toEqual([])
  })
})

test.describe("content pages on a phone, in dark mode", () => {
  test.use({ viewport: { width: 320, height: 640 }, colorScheme: "dark" })
  for (const path of ["/accessibilite", "/doc"]) {
    test(`${path} has no serious violation at 320 px, dark`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect.soft(await seriousViolations(page)).toEqual([])
    })
  }
})

test.describe("admin", () => {
  test("login, events, an event and its main pages have no serious violation", async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/admin/login")
    expect.soft(await seriousViolations(page)).toEqual([])
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)
    expect.soft(await seriousViolations(page)).toEqual([])

    await page.getByRole("link", { name: /Spectacle/ }).first().click()
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
    const base = page.url()
    expect.soft(await seriousViolations(page)).toEqual([])
    for (const sub of ["/shifts", "/registrations", "/message", "/invitations"]) {
      await page.goto(base + sub)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect.soft(await seriousViolations(page), sub).toEqual([])
    }
  })
})
