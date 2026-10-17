import { test, expect } from "@playwright/test"

/**
 * Inviting an administrator (#1045): the activation link goes by email only, the page never shows
 * it, and the success is announced. The new account is removed afterwards.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("an admin invitation sends the link by email and never shows it", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  const email = `e2e-invite-${Date.now()}@example.org`

  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  await page.goto("/admin/settings/admins")
  await page.getByRole("button", { name: "Inviter" }).click()
  const form = page.locator("form", { has: page.getByRole("heading", { name: "Inviter un administrateur" }) })
  await form.getByLabel("Nom").fill("Invitée E2E")
  await form.getByLabel("Email").fill(email)
  await form.getByRole("button", { name: "Envoyer l'invitation" }).click()

  await expect(page.getByRole("status").filter({ hasText: `Invitation envoyée à ${email}.` }))
    .toContainText("Le lien d'activation, valable 7 jours, lui a été envoyé par email.")
  await expect(page.getByRole("button", { name: "Inviter" })).toBeFocused()
  await expect(page.getByText(/accept-invite/)).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Copier le lien/ })).toHaveCount(0)

  // Inviting the same address again while its invitation is valid (#1053): refused, with a message
  // about this team only.
  await page.getByRole("button", { name: "Inviter" }).click()
  await form.getByLabel("Nom").fill("Invitée E2E")
  await form.getByLabel("Email").fill(email)
  await form.getByRole("button", { name: "Envoyer l'invitation" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Cette adresse fait déjà partie de votre équipe, ou son invitation est encore valable." })).toBeVisible()
  await form.getByRole("button", { name: "Annuler" }).click()

  await page.getByRole("button", { name: "Retirer Invitée E2E" }).click()
  await expect(page.getByText(email)).toHaveCount(0)
})
