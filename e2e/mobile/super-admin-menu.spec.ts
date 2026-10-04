import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"

/**
 * « Super Admin » menu by touch, on the WebKit engine with touch emulation (project
 * "webkit-iphone"), at a tablet width so the desktop nav that holds the menu is shown (on phones
 * the super-admin links are in the mobile panel instead). #590: the menu closed on mousedown
 * outside, which a tap on non-clickable content does not fire on iOS, so it stayed open.
 * Playwright's WebKit touch emulation fires mousedown on every tap, so that bug is not reproduced
 * here: on the old code only the aria-controls check fails. SuperAdminMenu.react.test.tsx proves
 * the pointerdown fix. The first test still guards the rule that a blur with no relatedTarget
 * does not close the menu (WebKit does not focus a tapped link).
 */

test.use({ viewport: { width: 1024, height: 768 } })

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

async function logIn(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).tap()
  // A super admin with no organization picked yet lands on the org picker (#267).
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)
}

async function openSuperAdminMenu(page: Page) {
  const nav = page.getByRole("navigation", { name: "Navigation de l'administration" })
  const trigger = nav.getByRole("button", { name: "Super Admin", exact: true })
  await waitForHydration(trigger)
  await trigger.tap()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  const menu = page.getByRole("menu", { name: "Menu super admin" })
  await expect(menu).toBeVisible()
  return { trigger, menu }
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await logIn(page)
  // The post-login redirect may still be navigating: a goto now would be « interrupted by another
  // navigation » (flaky in CI, #592). Let it settle, and only navigate if it landed elsewhere.
  await page.waitForLoadState("networkidle")
  if (!new URL(page.url()).pathname.startsWith("/super-admin/organizations")) await page.goto("/super-admin/organizations")
  await expect(page).toHaveURL(/\/super-admin\/organizations/)
})

test("tapping an item opens its page", async ({ page }) => {
  const { menu } = await openSuperAdminMenu(page)
  await menu.getByRole("menuitem", { name: "Santé du service" }).tap()
  await expect(page).toHaveURL(/\/super-admin\/health/)
})

test("a tap outside closes the menu", async ({ page }) => {
  const { trigger, menu } = await openSuperAdminMenu(page)
  await page.getByRole("main").tap({ position: { x: 10, y: 10 } })
  await expect(menu).toBeHidden()
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(trigger).not.toHaveAttribute("aria-controls")
})
