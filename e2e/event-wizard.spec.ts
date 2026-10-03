import { test, expect } from "@playwright/test"

/**
 * Three-step event creation (#401): information → shifts (with a series) → review → publish.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("an admin creates and publishes an event through the three steps", async ({ page }) => {
  test.setTimeout(120_000) // dev server compiles each page on first visit
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  // Step 1: blank form.
  await page.goto("/admin/events/new")
  const steps = page.getByRole("navigation", { name: "Étapes de création de l'événement" })
  await expect(steps.getByRole("listitem").nth(0)).toHaveAttribute("aria-current", "step")
  const title = `E2E Assistant ${Date.now()}`
  await page.getByLabel("Titre *").fill(title)
  await page.getByLabel("Date début *").fill("2031-05-10")
  await page.getByLabel("Date fin *").fill("2031-05-10")
  await page.getByRole("button", { name: /Créer/ }).click()

  // Step 2: shifts, with the assistant's indicator; a series of shifts.
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/shifts\?wizard=1$/)
  await expect(steps.getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step")
  await page.getByRole("button", { name: "Créer une série" }).click()
  await page.getByRole("combobox", { name: "Poste", exact: true }).fill("Bar")
  await page.getByRole("textbox", { name: "Début", exact: true }).fill("10:00")
  await page.getByRole("textbox", { name: "Fin", exact: true }).fill("14:00")
  await page.getByRole("button", { name: /^Créer 2 créneaux$/ }).click()
  await expect(page.getByRole("status").filter({ hasText: /2 créneaux créés/ })).toBeVisible()

  // Step 3: review, then publish.
  await page.getByRole("link", { name: /Continuer : vérification et publication/ }).click()
  await expect(page).toHaveURL(/\/review$/)
  await expect(steps.getByRole("listitem").nth(2)).toHaveAttribute("aria-current", "step")
  await expect(page.getByText("2 créneaux, 1 poste, 4 places").first()).toBeVisible()
  await page.getByRole("button", { name: "Publier" }).click()
  await expect(page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.")).toBeVisible()
  await expect(page.getByRole("link", { name: /Ouvrir la page de l'événement/ })).toBeVisible()
})
