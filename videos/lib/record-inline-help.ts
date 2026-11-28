import assert from "node:assert/strict"
import type { Page } from "playwright"
import type { Cue } from "./sentence-timing"

/** Actual #735 player. No catalogue overrides, fake media or published-state changes. */
export async function recordInlineHelp(page: Page, baseUrl: string, tap: (page: Page, target: ReturnType<Page["locator"]>) => Promise<void>, scene: (id: string, action: (at: Cue) => Promise<void>) => Promise<void>) {
  await scene("help", async at => {
  const help = page.getByRole("link", { name: "Aide (ouvre dans un nouvel onglet)", exact: true }).first()
  assert.equal(await help.getAttribute("href"), "/doc/admin")
  const popupReady = page.waitForEvent("popup")
  await at("Aide ouvre le guide organisateur")
  await tap(page, help)
  const popup = await popupReady
  await popup.waitForLoadState("domcontentloaded")
  const guideUrl = popup.url()
  assert.equal(new URL(guideUrl).origin, "https://www.benevol.app")
  assert.equal(new URL(guideUrl).pathname, "/doc/admin")
  await popup.close()
  await page.goto(guideUrl)
  await at("Retrouvons Premiers pas")
  const firstSteps = page.locator('a[href="/doc/premiers-pas"]').first()
  await firstSteps.waitFor(); await tap(page, firstSteps)
  const trigger = page.getByRole("button", { name: /^Voir la vidéo.*Bien démarrer avec une nouvelle organisation/ })
  // Unpublished/unavailable media is intentionally a blocker, never fabricated.
  await trigger.waitFor({ timeout: 8000 })
  await at("Quand une vidéo est disponible"); await tap(page, trigger)
  const regionId = await trigger.getAttribute("aria-controls")
  assert(regionId)
  const region = page.locator(`[id="${regionId}"]`)
  const video = region.locator("video")
  await video.waitFor()
  assert(await video.evaluate(async (el: HTMLVideoElement) => {
    const poster = new Image()
    poster.src = el.poster
    await poster.decode()
    const track = el.querySelector("track")
    if (!track) return false
    track.track.mode = "hidden"
    if (track.readyState !== 2) await new Promise<void>((resolve, reject) => {
      track.addEventListener("load", () => resolve(), { once: true })
      track.addEventListener("error", () => reject(new Error("Captions failed to load")), { once: true })
    })
    return poster.naturalWidth > 0 && track.track.cues !== null && track.track.cues.length > 0
  }), "The published poster and captions must load")
  assert(await video.evaluate((el: HTMLVideoElement) => !el.autoplay), "The reader's click must start playback, not an autoplay attribute")
  await page.waitForFunction(id => {
    const el = document.getElementById(id)?.querySelector("video")
    return !!el && !el.paused && el.currentTime > 0
  }, regionId, { timeout: 8000 })
  assert(await video.evaluate((el: HTMLVideoElement) => el.controls), "Show the real playback controls")
  await at("La transcription reste consultable"); await tap(page, region.locator("summary").filter({ hasText: "Transcription" }))
  assert(await region.getByRole("link", { name: /^Ouvrir dans la bibliothèque\s*:/ }).count() === 1)
  await at("Vous pouvez aussi ouvrir la bibliothèque"); await tap(page, trigger)
  assert.equal(await trigger.getAttribute("aria-expanded"), "false")
  assert(await video.evaluate((el: HTMLVideoElement) => el.paused))
  })
}
