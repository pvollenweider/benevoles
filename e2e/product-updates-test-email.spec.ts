import { test, expect } from "@playwright/test"
import { clearMailbox, waitForMessage, searchMessages } from "./helpers/mailpit"

/**
 * "Envoyer un test" on /super-admin/product-updates — defaults to the calling super admin's own
 * address, but can target any custom email instead (#235).
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test.beforeEach(async () => {
  await clearMailbox()
})

test("sending a test defaults to the super admin's own address", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const stamp = Date.now()
  await page.goto("/super-admin/product-updates")
  await page.getByLabel("Objet *").fill(`E2E test email ${stamp}`)
  await page.locator("textarea").fill("Contenu de test.")
  await page.getByRole("button", { name: "Envoyer un test" }).click()

  const msg = await waitForMessage(`subject:"[Test] E2E test email ${stamp}"`)
  expect(msg.To[0].Address.toLowerCase()).toBe(SUPER_ADMIN_EMAIL.toLowerCase())
})

test("sending a test to a custom address delivers it there instead", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const stamp = Date.now()
  const customEmail = `e2e-custom-test-${stamp}@example.com`
  await page.goto("/super-admin/product-updates")
  await page.getByLabel("Objet *").fill(`E2E custom email ${stamp}`)
  await page.locator("textarea").fill("Contenu de test.")
  await page.getByLabel(/Adresse du test/).fill(customEmail)
  await page.getByRole("button", { name: "Envoyer un test" }).click()

  const msg = await waitForMessage(`subject:"[Test] E2E custom email ${stamp}"`)
  expect(msg.To[0].Address.toLowerCase()).toBe(customEmail)

  // Only the custom address got it — not the super admin's own mailbox too.
  const matching = await searchMessages(`subject:"[Test] E2E custom email ${stamp}"`)
  expect(matching).toHaveLength(1)
})

test("rejects a malformed test email address", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const res = await page.request.post("/api/super-admin/product-updates/test", {
    data: { subject: "x", content: "y", email: "not-an-email" },
  })
  expect(res.status()).toBe(400)
})
