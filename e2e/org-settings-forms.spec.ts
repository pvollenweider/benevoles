import { test, expect } from "@playwright/test"

/**
 * Org name and slug forms: labelled inputs, announced status/errors, and no
 * React hydration mismatch on the settings page (the slug form used to render
 * the base domain from window.location on the client only).
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("settings forms are labelled, announce results and hydrate without mismatch", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit

  const hydrationErrors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydrat/i.test(msg.text())) hydrationErrors.push(msg.text())
  })
  page.on("pageerror", (err) => {
    if (/hydrat/i.test(err.message)) hydrationErrors.push(err.message)
  })

  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  await page.goto("/admin/settings/admins")

  // Labelled inputs (were unlabelled before).
  const nameInput = page.getByLabel("Nom", { exact: true })
  const slugInput = page.getByLabel("Identifiant", { exact: true })
  await expect(nameInput).toBeVisible()
  await expect(slugInput).toBeVisible()
  await expect(slugInput).toHaveAccessibleDescription(/Adresse de votre espace/)

  // Unchanged submit: announced, nothing sent.
  const nameForm = page.locator("form", { has: page.getByRole("heading", { name: "Nom de l'organisation" }) })
  await nameForm.getByRole("button", { name: "Enregistrer" }).click()
  await expect(nameForm.getByRole("status")).toHaveText("Aucune modification.")

  // Invalid value: announced as an alert and the field is marked invalid.
  await nameInput.fill("A")
  await nameForm.getByRole("button", { name: "Enregistrer" }).click()
  await expect(nameForm.getByRole("alert")).toContainText("au moins 2 caractères")
  await expect(nameInput).toHaveAttribute("aria-invalid", "true")

  // The address shown by the slug form is the same on server and client.
  expect(hydrationErrors).toEqual([])
})
