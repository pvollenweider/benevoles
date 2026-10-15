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
  // Non-blocking items (#565): practical info, registration window, reminders, each with its link.
  const review = page.getByRole("region", { name: "Vérification" })
  const practical = review.getByRole("listitem").filter({ hasText: "2 créneaux sans lieu ni contact" })
  await expect(practical).toBeVisible()
  await expect(practical).toContainText("À vérifier :")
  await expect(review.getByRole("link", { name: "Ajouter : 2 créneaux sans lieu ni contact" })).toHaveAttribute("href", /\/shifts$/)
  await expect(review.getByText("Inscriptions ouvertes dès la publication").first()).toBeVisible()
  await expect(review.getByText(/Rappels automatiques|Aucun rappel automatique/).first()).toBeVisible()
  await page.getByRole("button", { name: "Publier" }).click()
  await expect(page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.")).toBeVisible()
  // Once published, the coverage line and its link to the staffing page.
  await expect(review.getByRole("link", { name: "Voir les créneaux incomplets : 0 place occupée sur 4, 2 créneaux incomplets" })).toHaveAttribute("href", /\/staffing$/)
  await expect(page.getByRole("link", { name: /Ouvrir la page de l'événement/ })).toBeVisible()

  // The event page's reminders box (#705) states what goes out, with the timing of the cron.
  const reviewUrl = page.url()
  const eventUrl = reviewUrl.replace(/\/review$/, "")
  await page.goto(eventUrl)
  const box = page.getByRole("region", { name: /Rappels automatiques|Aucun rappel automatique/ })
  await expect(box).toBeVisible()
  await expect(box.getByRole("link", { name: "Rappels automatiques de l'événement" })).toHaveAttribute("href", /\/edit#event-reminders$/)

  // Reminders switched off for this event: the review links to the box, which takes focus.
  await page.goto(reviewUrl.replace(/\/review$/, "/edit"))
  await page.getByRole("checkbox", { name: "Rappels automatiques" }).uncheck()
  await expect(page.getByText(/Modifications enregistrées à/)).toBeVisible()
  await page.goto(reviewUrl)
  await review.getByRole("link", { name: /Rappels automatiques coupés pour cet événement/ }).click()
  await expect(page).toHaveURL(/\/edit#event-reminders$/)
  await expect(page.getByRole("checkbox", { name: "Rappels automatiques" })).toBeFocused()
  // The event page says so too, whatever the organization's settings.
  await page.goto(eventUrl)
  await expect(page.getByRole("region", { name: "Rappels automatiques coupés pour cet événement" })).toBeVisible()
})
