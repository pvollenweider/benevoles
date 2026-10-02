import { test, expect, type Page } from "@playwright/test"

/**
 * Account menu by touch, on the WebKit engine with iPhone emulation (project "webkit-iphone").
 * Regression of #589: on iOS Safari a tapped button does not take focus, so the menu's onBlur saw
 * a blur with no new target, closed the menu before the click, and « Se déconnecter » did nothing.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function logIn(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).tap()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function openAccountMenu(page: Page) {
  const nav = page.getByRole("navigation", { name: "Navigation de l'administration" })
  const trigger = nav.getByRole("button", { name: "Administrateur (org par défaut)" })
  await trigger.tap()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  const menu = page.getByRole("menu", { name: "Menu du compte" })
  await expect(menu).toBeVisible()
  return { trigger, menu }
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await logIn(page)
})

test("tapping « Se déconnecter » signs out to the login page", async ({ page }) => {
  const { menu } = await openAccountMenu(page)
  await menu.getByRole("menuitem", { name: "Se déconnecter" }).tap()
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible()
})

test("tapping « Mon compte » opens the account page", async ({ page }) => {
  const { menu } = await openAccountMenu(page)
  await menu.getByRole("menuitem", { name: "Mon compte" }).tap()
  await expect(page).toHaveURL(/\/admin\/account/)
})

test("a tap outside closes the menu", async ({ page }) => {
  const { trigger, menu } = await openAccountMenu(page)
  await page.getByRole("main").tap({ position: { x: 10, y: 10 } })
  await expect(menu).toBeHidden()
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
})
