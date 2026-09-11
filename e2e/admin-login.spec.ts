import { test, expect } from "@playwright/test"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("org admin can log in and reach the events list", async ({ page }) => {
  await page.goto("/admin/login")

  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()

  await expect(page).toHaveURL(/\/admin\/events/)
})

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/admin/login")

  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill("not-the-right-password")
  await page.getByRole("button", { name: "Se connecter" }).click()

  await expect(page.getByText("Email ou mot de passe incorrect.")).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/login/)
})
