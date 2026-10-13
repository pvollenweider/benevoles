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
test("detail page shows the video first, the viewer content, not the internal script, and collapses the details by default", async ({ page }) => {
  await page.goto("/videos/EVENT_CREATE_BLANK")
  const main = page.getByRole("main")

  await expect(main.getByRole("heading", { level: 2, name: "Dans cette vidéo" })).toBeVisible()
  // Watch page: the player comes right after the title, the steps, key points and transcript are
  // closed disclosures under « Pour aller plus loin ».
  // The player (or its « bientôt disponible » fallback) is the first thing after the title.
  const playerFirst = await main.evaluate((m) => {
    const h1 = m.querySelector("h1")
    const player = m.querySelector("video") ?? [...m.querySelectorAll("p, div")].find((e) => e.textContent?.trim() === "Vidéo bientôt disponible.")
    const description = m.querySelector("h1 ~ * p")
    if (!h1 || !player) return false
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    return after(h1, player) && (!description || after(player, description) || player.contains(description))
  })
  expect(playerFirst).toBe(true)
  await expect(main.getByRole("heading", { level: 2, name: "Pour aller plus loin" })).toBeVisible()
  await expect(main.locator("summary", { hasText: /^▸?\s*Les étapes \(\d+\)$/ })).toBeVisible()
  await expect(main.locator("summary", { hasText: /^▸?\s*À retenir \(\d+\)$/ })).toBeVisible()
  await expect(main.locator("details ol").first()).toBeHidden()
  await expect(main.getByRole("heading", { level: 2, name: "Script", exact: true })).toHaveCount(0)
  await expect(main.getByText("Utilité", { exact: true })).toHaveCount(0)
  await expect(main.getByText("Démonstration", { exact: true })).toHaveCount(0)

  const transcript = main.getByText("Quand aucun modèle ne correspond vraiment").first()
  await expect(transcript).toBeHidden()
  await main.locator("summary", { hasText: "Transcription complète" }).click()
  await expect(transcript).toBeVisible()
})
