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
  // The optional « Comment avez-vous connu … ? » (#1094): its precision shows only with « Autre ».
  await expect(page.getByLabel(/Précisez comment vous nous avez connus/)).toHaveCount(0)
  await page.getByLabel(/Comment avez-vous connu .+ \? \(facultatif\)/).selectOption({ label: "Autre" })
  await page.getByLabel(/Précisez comment vous nous avez connus/).fill("la newsletter E2E")
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
  await waitForMessage(`to:${email} subject:"Bienvenue sur"`)

  // The owner chooses a password and signs in: inviting more administrators waits for the
  // validation (#1045), the team page says so instead of offering « Inviter ».
  const ownerPassword = `E2e-${stamp}-Owner-pass!`
  await page.getByLabel("Nouveau mot de passe").fill(ownerPassword)
  await page.getByLabel("Confirmer le mot de passe").fill(ownerPassword)
  await page.getByRole("button", { name: "Créer mon mot de passe" }).click()
  await expect(page.getByRole("heading", { name: "Mot de passe créé" })).toBeVisible({ timeout: 30_000 }) // password hashing
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mot de passe").fill(ownerPassword)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  await page.goto("/admin/settings/admins")
  await expect(page.getByText("Vous pourrez inviter d'autres administrateurs une fois qu'il sera validé")).toBeVisible()
  await expect(page.getByRole("button", { name: "Inviter" })).toHaveCount(0)

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
  // The answer is on the space's page, for the operator only, and counted in the statistics.
  await page.goto(`/super-admin/organizations/${slug}`)
  await expect(page.getByText("Comment l'association nous a connus : Autre : la newsletter E2E")).toBeVisible()
  await page.goto("/super-admin/stats")
  await expect(page.getByRole("table", { name: "Comment les espaces nous ont connus" }).getByRole("row", { name: /^Autre/ })).toBeVisible()
  expect((await page.request.post(`/api/super-admin/organizations/${space!.id}/review`, { data: { decision: "refuse" } })).ok()).toBeTruthy()
})
