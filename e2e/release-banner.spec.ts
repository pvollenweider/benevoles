import { test, expect } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { waitForHydration } from "./helpers/hydration"
import pkg from "../package.json"

/**
 * « Une nouvelle version est disponible » banner (#612), super admin only. No network call: the
 * ReleaseCheckState row is seeded directly in the database (same role as the cron route writing
 * it) via scripts/e2e-seed-release-check.ts, run in a child process — Prisma's generated client
 * is ESM-only (`import.meta`) and Playwright's own test transform can't load it directly.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"
const LATEST_VERSION = "v999.0.0"
const RELEASE_URL = `https://github.com/pvollenweider/benevoles/releases/tag/${LATEST_VERSION}`

function seedScript(...args: string[]) {
  execFileSync("npx", ["tsx", "scripts/e2e-seed-release-check.ts", ...args], { stdio: "inherit" })
}

test.beforeEach(() => {
  seedScript("seed", LATEST_VERSION, RELEASE_URL)
  seedScript("reset-dismissed", SUPER_ADMIN_EMAIL)
})

test.afterAll(() => {
  seedScript("clear")
})

async function logIn(page: import("@playwright/test").Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)
}

test("shown to the super admin, dismissible, stays gone after a reload", async ({ page }) => {
  await logIn(page)
  await page.goto("/super-admin/organizations")

  const banner = page.getByRole("region", { name: "Nouvelle version disponible" })
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(`Une nouvelle version est disponible : ${LATEST_VERSION} (vous utilisez ${pkg.version}).`)
  await expect(banner.getByRole("link", { name: /Voir les notes de version/ })).toHaveAttribute("href", RELEASE_URL)

  const dismissButton = banner.getByRole("button", { name: /Masquer/ })
  await waitForHydration(dismissButton)
  await dismissButton.click()
  await expect(banner).toBeHidden()

  await page.reload()
  await expect(page.getByRole("region", { name: "Nouvelle version disponible" })).toBeHidden()
})
