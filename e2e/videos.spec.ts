import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * The video library (#644). VIDEO_MEDIA_BASE_URL isn't set in the CI e2e environment, so the
 * detail page's "coming soon" fallback is exercised there, not an actual <video> playback; with it
 * set (local run against medias.benevol.app), e2e/videos-seo.spec.ts covers the playable pages.
 */

test("gallery loads, filters by theme, and opens a detail page", async ({ page }) => {
  await page.goto("/videos")
  await expect(page.getByRole("heading", { level: 1, name: "Bibliothèque vidéo" })).toBeVisible()
  const cardsBefore = await page.getByRole("listitem").count()
  expect(cardsBefore).toBeGreaterThan(1)

  // VideoGallery is a client component (filters run in the browser, #592): wait for hydration
  // before interacting with its first control, or the selectOption below can be a no-op.
  const themeSelect = page.getByLabel("Thème")
  await waitForHydration(themeSelect)
  await themeSelect.selectOption({ label: "Le parcours complet du bénévole" })
  await expect(page.getByRole("status").filter({ hasText: /vidéo/ })).toBeVisible()
  const cardsAfter = await page.getByRole("listitem").count()
  expect(cardsAfter).toBeGreaterThan(0)
  expect(cardsAfter).toBeLessThan(cardsBefore)

  await page.getByRole("link", { name: /comme bénévole depuis son téléphone/ }).click()
  await expect(page).toHaveURL(/\/videos\/VOLUNTEER_REGISTER$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("comme bénévole depuis son téléphone")
})

test("a manifest slug redirects to the canonical stable id", async ({ page }) => {
  await page.goto("/videos/event-create-blank")
  await expect(page).toHaveURL(/\/videos\/EVENT_CREATE_BLANK$/)
})

test("an unknown id gives a 404", async ({ page }) => {
  const response = await page.goto("/videos/NOT_A_VIDEO")
  expect(response?.status()).toBe(404)
})

test("shows « Vidéo bientôt disponible » without VIDEO_MEDIA_BASE_URL", async ({ page }) => {
  test.skip(Boolean(process.env.VIDEO_MEDIA_BASE_URL), "VIDEO_MEDIA_BASE_URL is set: the player is shown instead")
  await page.goto("/videos/EVENT_CREATE_BLANK")
  await expect(page.getByText("Vidéo bientôt disponible.")).toBeVisible()
  await expect(page.locator("video")).toHaveCount(0)
})

// #644 owner feedback: the detail page shows what the video explains to the viewer, never the
// internal editorial script (Utilité/Démonstration/Résultat visible/Points d'attention).
test("detail page shows the viewer content, not the internal script, and the transcript is collapsed by default", async ({ page }) => {
  await page.goto("/videos/EVENT_CREATE_BLANK")
  const main = page.getByRole("main")

  await expect(main.getByRole("heading", { level: 2, name: "Dans cette vidéo" })).toBeVisible()
  await expect(main.getByRole("heading", { level: 2, name: "Les étapes" })).toBeVisible()
  await expect(main.getByRole("heading", { level: 2, name: "À retenir" })).toBeVisible()
  await expect(main.getByRole("heading", { level: 2, name: "Script", exact: true })).toHaveCount(0)
  await expect(main.getByText("Utilité", { exact: true })).toHaveCount(0)
  await expect(main.getByText("Démonstration", { exact: true })).toHaveCount(0)

  const transcript = main.getByText("Quand aucun modèle ne correspond vraiment").first()
  await expect(transcript).toBeHidden()
  await main.locator("summary", { hasText: "Transcription complète" }).click()
  await expect(transcript).toBeVisible()
})
