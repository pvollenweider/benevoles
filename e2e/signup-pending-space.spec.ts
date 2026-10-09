import { test, expect } from "@playwright/test"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * Self-service sign-up end to end (#810): the form, the confirmation email, the « Confirmer »
 * button, then the space awaiting validation: no public page at all. Refused (deleted) at the end
 * by the super admin, so it leaves nothing behind.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test("a confirmed sign-up creates a space with no public page until it is validated", async ({ page, browser }) => {
  const stamp = Date.now()
  const name = `E2E attente ${stamp}`
  const slug = `e2e-attente-${stamp}`
  const email = `e2e-signup-${stamp}@example.com`

  await page.goto("/inscription")
  await page.getByLabel("Nom de l'association").fill(name)
  await page.getByLabel("Votre association et votre besoin").fill("Association de test E2E, une fête avec une vingtaine de bénévoles.")
  await page.getByLabel("Votre nom").fill("Camille E2E")
  await page.getByLabel("Votre adresse email").fill(email)
  // Faster than a person is ignored (src/lib/signup.ts): wait past the minimum fill time.
  await page.waitForTimeout(3_500)
  await page.getByRole("button", { name: "Créer mon espace" }).click()
  await expect(page.getByRole("heading", { name: "Vérifiez votre boîte email" })).toBeVisible()

  // The confirmation email holds only the link; opening it changes nothing, the button does.
  const confirmation = await waitForMessage(`to:${email} subject:"Confirmez votre adresse"`)
  const link = (await getMessageText(confirmation.ID)).match(/\/inscription\/confirmer\?t=[^\s]+/)?.[0]
  expect(link).toBeTruthy()
  await page.goto(link!)
  await page.getByRole("button", { name: "Confirmer et créer mon espace" }).click()
  await expect(page).toHaveURL(/\/admin\/accept-invite/)

  // The same activation link also arrives by email, for someone who closes the page.
  await waitForMessage(`to:${email} subject:"Choisissez votre mot de passe"`)

  // No public page, not even with the address: the space awaits validation.
  const visitor = await browser.newContext()
  const anonymous = await visitor.newPage()
  const home = await anonymous.goto(`/?org=${slug}`)
  expect(home?.status()).toBe(404)
  await visitor.close()

  // Clean up as the operator: refuse, which deletes the space and its account.
  await page.context().clearCookies()
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)
  const orgs = (await (await page.request.get("/api/super-admin/organizations")).json()) as { id: string; slug: string }[]
  const space = orgs.find((o) => o.slug === slug)
  expect(space, "the space created by the sign-up").toBeTruthy()
  expect((await page.request.post(`/api/super-admin/organizations/${space!.id}/review`, { data: { decision: "refuse" } })).ok()).toBeTruthy()
})
