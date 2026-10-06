import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * Videos referenced from the documentation (#645): a `<!-- video: ID -->` line of a unit of guide/
 * (#649) renders as the button « Voir la vidéo : <titre> (<durée>) », which opens the player in
 * place, without leaving the documentation (a disclosure: aria-expanded, aria-controls); before
 * hydration it is a plain link to /videos/<ID>?from=doc. A guide (/doc/admin) keeps the plain link.
 * Only when the video can play: VIDEO_MEDIA_BASE_URL must be set (it isn't in the default e2e
 * environment, where the unit shows no video at all). The rendering rules themselves are
 * unit-tested in src/lib/__tests__/doc-video-references.test.ts and
 * src/components/__tests__/DocVideoInline.react.test.tsx.
 */
const mediaBase = process.env.VIDEO_MEDIA_BASE_URL

const ORG_LABEL = /^Voir la vidéo\s: Bien démarrer avec une nouvelle organisation \(\d+ min\)$/

test("without VIDEO_MEDIA_BASE_URL the unit shows no video", async ({ page }) => {
  test.skip(!!mediaBase, "VIDEO_MEDIA_BASE_URL is set: the players are checked below")
  await page.goto("/doc/premiers-pas")
  await expect(page.getByRole("heading", { level: 1, name: "Premiers pas" })).toBeVisible()
  await expect(page.locator('a[href^="/videos/"]')).toHaveCount(0)
  await expect(page.getByRole("button", { name: /^Voir la vidéo/ })).toHaveCount(0)
})

test.describe("with VIDEO_MEDIA_BASE_URL", () => {
  test.skip(!mediaBase, "needs VIDEO_MEDIA_BASE_URL in the e2e environment")

  async function openPlayer(page: Page) {
    const button = page.getByRole("button", { name: ORG_LABEL })
    await expect(button).toHaveAttribute("aria-expanded", "false")
    await button.click()
    await expect(button).toHaveAttribute("aria-expanded", "true")
    return button
  }

  test("without JavaScript the unit links to the video's page in the same tab", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto("/doc/premiers-pas")
    const link = page.getByRole("link", { name: ORG_LABEL })
    await expect(link).toHaveAttribute("href", "/videos/ORG_FIRST_STEPS?from=doc")
    await expect(link).not.toHaveAttribute("target", /.*/)
    await expect(page.locator("video")).toHaveCount(0)
    await context.close()
  })

  test("a link focused before hydration hands the focus to the button that replaces it", async ({ page }) => {
    // Hold the scripts until the link has the focus, as on a slow connection.
    let release!: () => void
    const released = new Promise<void>((resolve) => { release = resolve })
    await page.route("**/_next/static/**/*.js", async (route) => {
      await released
      await route.continue()
    })
    await page.goto("/doc/premiers-pas", { waitUntil: "domcontentloaded" })
    const link = page.getByRole("link", { name: ORG_LABEL })
    await link.focus()
    await expect(link).toBeFocused()
    release()
    const button = page.getByRole("button", { name: ORG_LABEL })
    await expect(button).toBeVisible({ timeout: 30_000 })
    await expect(button).toBeFocused()
  })

  test("the button of an organisers' unit opens the player in place, then hides it", async ({ page }) => {
    await page.goto("/doc/premiers-pas")
    // The unit has one video at most; nothing is downloaded before it's opened.
    await expect(page.getByRole("button", { name: ORG_LABEL })).toBeVisible()
    await expect(page.locator("main [data-doc-video]")).toHaveCount(1)
    await expect(page.locator("video")).toHaveCount(0)

    const button = await openPlayer(page)
    await expect(page).toHaveURL(/\/doc\/premiers-pas$/)
    await expect(button).toBeFocused()
    const region = page.locator(`[id="${await button.getAttribute("aria-controls")}"]`)
    const video = region.locator("video")
    await expect(video).toBeVisible()
    await expect(video).not.toHaveAttribute("autoplay", /.*/)
    await expect(video.locator('track[kind="captions"][srclang="fr"]')).toHaveCount(1)
    await expect(video.locator("source")).toHaveAttribute("src", /^https:\/\/[^/]+\/([a-z0-9-]+)\/\1\.mp4$/)
    await expect(region.getByRole("group", { name: "Cette vidéo vous a-t-elle été utile ?" })).toBeVisible()
    await expect(region.locator("summary", { hasText: /^\W*Transcription$/ })).toBeVisible()
    await expect(region.getByRole("link", { name: "Ouvrir dans la bibliothèque" })).toHaveAttribute("href", "/videos/ORG_FIRST_STEPS?from=doc")

    await button.click()
    await expect(button).toHaveAttribute("aria-expanded", "false")
    await expect(button).toBeFocused()
    await expect(video).toBeHidden()
  })

  test("the button of a volunteers' unit works with the keyboard", async ({ page }) => {
    await page.goto("/doc/trouver-la-page-d-inscription")
    const button = page.getByRole("button", { name: /^Voir la vidéo\s: Trouver et lire la page d’inscription \(\d+ min\)$/ })
    await button.focus()
    await expect(button).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(button).toHaveAttribute("aria-expanded", "true")
    await expect(page.locator("video")).toBeVisible()
    await page.keyboard.press("Space")
    await expect(button).toHaveAttribute("aria-expanded", "false")
  })

  test("the feedback under the player counts the answer under « documentation »", async ({ page }) => {
    await page.route("**/api/public/video-feedback", (route) => route.fulfill({ status: 201, json: { ok: true } }))
    await page.goto("/doc/premiers-pas")
    await openPlayer(page)
    const request = page.waitForRequest("**/api/public/video-feedback")
    await page.getByRole("group", { name: "Cette vidéo vous a-t-elle été utile ?" }).getByRole("button", { name: "Oui" }).click()
    expect((await request).postDataJSON()).toMatchObject({ videoId: "ORG_FIRST_STEPS", useful: true, context: "documentation" })
  })

  test("a guide keeps the plain link to the library", async ({ page }) => {
    await page.goto("/doc/admin")
    await expect(page.locator("main p[data-doc-video] a").first()).toHaveAttribute("href", /^\/videos\/[A-Z0-9_]+\?from=doc$/)
  })

  for (const colorScheme of ["light", "dark"] as const) {
    test(`a unit with its player open has no serious violation (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto("/doc/premiers-pas")
      await openPlayer(page)
      await page.locator("main details").evaluateAll((els) => els.forEach((d) => d.setAttribute("open", "")))
      expect.soft(await seriousViolations(page)).toEqual([])
    })
  }
})
