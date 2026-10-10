import { test, expect, type Page, type Request } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The homepage's phone plays the volunteer sign-up video in place (#765): « Voir l'inscription en
 * vidéo » over the still opens the existing player there; nothing of the video (media, captions,
 * poster) is requested before the press; without JavaScript, a plain link to the video's page.
 * Only when the video can play: VIDEO_MEDIA_BASE_URL must be set (it isn't in the default e2e
 * environment, where the phone stays a still image). The media host is intercepted here: these
 * tests check what the page asks for, not the host. The component's rules are unit-tested in
 * src/components/__tests__/HomeSignupVideo.react.test.tsx.
 */
const mediaBase = process.env.VIDEO_MEDIA_BASE_URL?.replace(/\/+$/, "")
const NAME = /^Voir l\Winscription en vidéo \(\d+ min\)$/

test("without VIDEO_MEDIA_BASE_URL the phone stays a still image", async ({ page }) => {
  test.skip(!!mediaBase, "VIDEO_MEDIA_BASE_URL is set: the player is checked below")
  await page.goto("/")
  await expect(page.getByRole("img", { name: /^La page d.inscription sur un téléphone/ })).toBeVisible()
  await expect(page.getByRole("button", { name: NAME })).toHaveCount(0)
  await expect(page.getByRole("link", { name: NAME })).toHaveCount(0)
})

test.describe("with VIDEO_MEDIA_BASE_URL", () => {
  test.skip(!mediaBase, "needs VIDEO_MEDIA_BASE_URL in the e2e environment")

  async function trackMedia(page: Page): Promise<Request[]> {
    const requests: Request[] = []
    await page.route(`${mediaBase}/**`, (route) => {
      requests.push(route.request())
      // The media is held, never answered: a refusal would swap the player for « Vidéo bientôt
      // disponible ». The poster and the captions may fail, the player stays.
      if (route.request().url().endsWith(".mp4")) return new Promise<void>(() => {})
      return route.fulfill({ status: 404, body: "" })
    })
    return requests
  }

  test("nothing of the video is requested on load; the press plays it in place with the focus on it", async ({ page }) => {
    const media = await trackMedia(page)
    await page.goto("/")
    const trigger = page.getByRole("button", { name: NAME })
    await expect(trigger).toBeVisible()
    await page.waitForLoadState("networkidle")
    expect(media).toHaveLength(0)
    await expect(page.locator("video")).toHaveCount(0)

    await trigger.click()
    await expect(page).toHaveURL(/\/$/)
    const video = page.locator("video")
    await expect(video).toBeFocused()
    await expect(video).not.toHaveAttribute("autoplay", /.*/)
    await expect(video.locator('track[kind="captions"][srclang="fr"]')).toHaveCount(1)
    // The press asks for the media (held by the intercepted host).
    await expect.poll(() => media.filter((r) => r.url().endsWith(".mp4")).length).toBeGreaterThan(0)
    await expect(page.getByRole("link", { name: "Transcription et page de la vidéo" })).toHaveAttribute("href", "/videos/VOLUNTEER_REGISTER")
  })

  test("« Fermer la vidéo » brings the still back and returns the focus to the trigger", async ({ page }) => {
    await trackMedia(page)
    await page.goto("/")
    await page.getByRole("button", { name: NAME }).click()
    await page.getByRole("button", { name: "Fermer la vidéo" }).click()
    await expect(page.getByRole("button", { name: NAME })).toBeFocused()
    await expect(page.getByRole("img", { name: /^La page d.inscription sur un téléphone/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Fermer la vidéo" })).toHaveCount(0)
  })

  test("the keyboard opens it too, and the opened player has no serious axe violation", async ({ page }) => {
    await trackMedia(page)
    await page.goto("/")
    await page.getByRole("button", { name: NAME }).focus()
    await page.keyboard.press("Enter")
    await expect(page.locator("video")).toBeFocused()
    // The screen's overflow would clip the player's ring: the screen draws it on the bezel.
    const screenRing = await page.locator("video").evaluate((v) => {
      const screen = v.closest(".overflow-hidden")!
      return { matches: screen.matches(":has(video:focus-visible)"), outline: getComputedStyle(screen).outlineStyle }
    })
    expect(screenRing).toEqual({ matches: true, outline: "solid" })
    expect(await seriousViolations(page)).toEqual([])
  })

  test("without JavaScript the phone links to the video's page", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto("/")
    await expect(page.getByRole("link", { name: NAME })).toHaveAttribute("href", "/videos/VOLUNTEER_REGISTER")
    await expect(page.locator("video")).toHaveCount(0)
    await context.close()
  })
})
