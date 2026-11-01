import { test, expect } from "@playwright/test"
import { clearMailbox, waitForMessage, searchMessages, getMessageText } from "./helpers/mailpit"
import { waitForHydration } from "./helpers/hydration"
import { passSecondFactor } from "./helpers/super-admin"

/**
 * "Envoyer un test" on /super-admin/product-updates — defaults to the calling super admin's own
 * address, but can target any custom email instead (#235).
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test.beforeEach(async () => {
  // Emails go through a busy dev server and Mailpit in CI: allow up to 90 s (#592).
  test.slow()
  await clearMailbox()
})

test("sending a test defaults to the super admin's own address", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await passSecondFactor(page)
  // A super admin with no organization picked yet lands on the org picker (#267).
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const stamp = Date.now()
  await page.goto("/super-admin/product-updates")
  // Typed before hydration, the controlled fields would be emptied and the test never sent (#592).
  await waitForHydration(page.getByLabel("Objet *"))
  await page.getByLabel("Objet *").fill(`E2E test email ${stamp}`)
  await page.locator("textarea").fill("Contenu de test.")
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/super-admin/product-updates/test") && r.request().method() === "POST")
  await page.getByRole("button", { name: "Envoyer un test" }).click()
  expect((await sent).ok()).toBe(true)

  const msg = await waitForMessage(`subject:"[Test] E2E test email ${stamp}"`)
  expect(msg.To[0].Address.toLowerCase()).toBe(SUPER_ADMIN_EMAIL.toLowerCase())
})

test("sending a test to a custom address delivers it there instead", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await passSecondFactor(page)
  // A super admin with no organization picked yet lands on the org picker (#267).
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const stamp = Date.now()
  const customEmail = `e2e-custom-test-${stamp}@example.com`
  await page.goto("/super-admin/product-updates")
  // Typed before hydration, the controlled fields would be emptied and the test never sent (#592).
  await waitForHydration(page.getByLabel("Objet *"))
  await page.getByLabel("Objet *").fill(`E2E custom email ${stamp}`)
  await page.locator("textarea").fill("Contenu de test.")
  await page.getByLabel(/Adresse du test/).fill(customEmail)
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/super-admin/product-updates/test") && r.request().method() === "POST")
  await page.getByRole("button", { name: "Envoyer un test" }).click()
  expect((await sent).ok()).toBe(true)

  const msg = await waitForMessage(`subject:"[Test] E2E custom email ${stamp}"`)
  expect(msg.To[0].Address.toLowerCase()).toBe(customEmail)

  // Only the custom address got it — not the super admin's own mailbox too.
  const matching = await searchMessages(`subject:"[Test] E2E custom email ${stamp}"`)
  expect(matching).toHaveLength(1)
})

test("a test email starts from a version of the changelog, edited before sending (#762)", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await passSecondFactor(page)
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const stamp = Date.now()
  await page.goto("/super-admin/product-updates")
  const picker = page.getByLabel("Partir des nouveautés de la version")
  await waitForHydration(picker)
  const version = await picker.inputValue()
  expect(version).toMatch(/^\d+\.\d+\.\d+/)
  await page.getByRole("button", { name: "Préremplir" }).click()
  const subject = page.getByLabel("Objet *")
  const escaped = version.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
  await expect(subject).toHaveValue(new RegExp(`version ${escaped}$`))
  await expect(page.locator("textarea")).toHaveValue(new RegExp(`/nouveautes#${escaped}\\)\\.$`))
  // Editable before sending: the subject gets a stamp so this test finds its own email.
  await subject.fill(`${await subject.inputValue()} ${stamp}`)
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/super-admin/product-updates/test") && r.request().method() === "POST")
  await page.getByRole("button", { name: "Envoyer un test" }).click()
  expect((await sent).ok()).toBe(true)

  const msg = await waitForMessage(`subject:"${stamp}"`)
  expect(msg.Subject).toContain(`version ${version} ${stamp}`)
  expect(await getMessageText(msg.ID)).toContain(`/nouveautes#${version}`)
})

test("rejects a malformed test email address", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await passSecondFactor(page)
  // A super admin with no organization picked yet lands on the org picker (#267).
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const res = await page.request.post("/api/super-admin/product-updates/test", {
    data: { subject: "x", content: "y", email: "not-an-email" },
  })
  expect(res.status()).toBe(400)
})
