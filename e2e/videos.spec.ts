import { test, expect } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * The internal video library (#644): unlisted (no nav link), but still reachable and working by
 * URL. VIDEO_MEDIA_BASE_URL isn't set in the e2e environment (.env.e2e.5), so the detail page's
 * "coming soon" fallback is exercised here, not an actual <video> playback.
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
  await page.goto("/videos/EVENT_CREATE_BLANK")
  await expect(page.getByText("Vidéo bientôt disponible.")).toBeVisible()
  await expect(page.locator("video")).toHaveCount(0)
})
