import { test, expect } from "@playwright/test"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("org admin logs in and lands on the dashboard, with what needs attention (#1098)", async ({ page }) => {
  await page.goto("/admin/login")

  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()

  await expect(page).toHaveURL(/\/admin\/dashboard$/)
  await expect(page.getByRole("heading", { level: 2, name: "Ce qui demande votre attention" })).toBeVisible()
})

test("a deep admin link opened signed out comes back to that page after login (#1098)", async ({ page }) => {
  await page.goto("/admin/members?verify=1")
  await expect(page).toHaveURL(/\/admin\/login\?callbackUrl=/)

  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()

  await expect(page).toHaveURL(/\/admin\/members\?verify=1$/)
})

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/admin/login")

  // Same message for an unknown address and a wrong password (no account enumeration). An address
  // with no account keeps this failure out of the org admin's login budget (10 per 15 min), which
  // the specs that sign in as that admin need (#592).
  await page.getByLabel("Email").fill("no-account@example.com")
  await page.getByLabel("Mot de passe").fill("not-the-right-password")
  await page.getByRole("button", { name: "Se connecter" }).click()

  await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/login/)
})
