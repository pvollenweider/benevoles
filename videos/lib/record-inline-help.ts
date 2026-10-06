import assert from "node:assert/strict"
import type { Page } from "playwright"

/** Actual #735 player. No catalogue overrides, fake media or published-state changes. */
export async function recordInlineHelp(page: Page, baseUrl: string, tap: (page: Page, target: ReturnType<Page["locator"]>) => Promise<void>, at: (fraction: number) => Promise<void>) {
  const help = page.getByRole("link", { name: "Aide (ouvre dans un nouvel onglet)", exact: true }).first()
  assert.equal(await help.getAttribute("href"), "/doc/admin")
  const popupReady = page.waitForEvent("popup")
  await tap(page, help)
  const popup = await popupReady
  await popup.waitForLoadState("domcontentloaded")
  assert.equal(new URL(popup.url()).origin, new URL(baseUrl).origin)
  await popup.close()
  await page.goto(`${baseUrl}/doc/admin`)
  await at(0.15)
  const firstSteps = page.locator('a[href="/doc/premiers-pas"]').first()
  await firstSteps.waitFor(); await tap(page, firstSteps)
  const trigger = page.getByRole("button", { name: /^Voir la vidéo.*Bien démarrer avec une nouvelle organisation/ })
  // Unpublished/unavailable media is intentionally a blocker, never fabricated.
  await trigger.waitFor({ timeout: 8000 })
  await at(0.35); await tap(page, trigger)
  const regionId = await trigger.getAttribute("aria-controls")
  assert(regionId)
  const region = page.locator(`[id="${regionId}"]`)
  const video = region.locator("video")
  await video.waitFor()
  assert(await video.evaluate((el: HTMLVideoElement) => el.paused && !el.autoplay), "Inline help must not autoplay")
  assert(await video.evaluate((el: HTMLVideoElement) => el.controls), "Show the real playback controls")
  await at(0.58); await tap(page, region.locator("summary").filter({ hasText: "Transcription" }))
  assert(await region.getByRole("link", { name: "Ouvrir dans la bibliothèque", exact: true }).count() === 1)
  await at(0.80); await tap(page, trigger)
  assert.equal(await trigger.getAttribute("aria-expanded"), "false")
  assert(await video.evaluate((el: HTMLVideoElement) => el.paused))
}
