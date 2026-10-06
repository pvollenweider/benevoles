import { test, expect } from "@playwright/test"

/**
 * Videos referenced from the guides (#645): a `<!-- video: ID -->` line of GUIDE_ADMIN.md renders
 * as « Voir la vidéo : <titre> (<durée>) », a plain link to /videos/<ID>?from=doc in the same tab. Only when
 * the video can play: VIDEO_MEDIA_BASE_URL must be set (it isn't in the default e2e environment,
 * where the guide shows no video link at all). The rendering rules themselves are unit-tested in
 * src/lib/__tests__/doc-video-references.test.ts.
 */
const mediaBase = process.env.VIDEO_MEDIA_BASE_URL

test("without VIDEO_MEDIA_BASE_URL the guide shows no video link", async ({ page }) => {
  test.skip(!!mediaBase, "VIDEO_MEDIA_BASE_URL is set: the links are followed below")
  await page.goto("/doc/admin")
  await expect(page.getByRole("heading", { name: "Premiers pas", exact: true })).toBeVisible()
  await expect(page.locator('a[href^="/videos/"]')).toHaveCount(0)
})

test.describe("with VIDEO_MEDIA_BASE_URL", () => {
  test.skip(!mediaBase, "needs VIDEO_MEDIA_BASE_URL in the e2e environment")

  test("a video link of the admin guide names the video and opens its page in the same tab", async ({ page, context }) => {
    await page.goto("/doc/admin")
    const link = page.getByRole("link", { name: /^Voir la vidéo\s: Bien démarrer avec une nouvelle organisation \(\d+ min\)$/ })
    await expect(link).toHaveAttribute("href", "/videos/ORG_FIRST_STEPS?from=doc")
    await expect(link).not.toHaveAttribute("target", /.*/)

    // Right under its section's title.
    const sectionLink = page.locator("#premiers-pas + p[data-doc-video] a")
    await expect(sectionLink).toHaveAttribute("href", "/videos/ORG_FIRST_STEPS?from=doc")

    let opened = false
    context.on("page", () => { opened = true })
    await link.click()
    await expect(page).toHaveURL(/\/videos\/ORG_FIRST_STEPS\?from=doc$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bien démarrer avec une nouvelle organisation")
    expect(opened).toBe(false)
  })

  test("the link of a documentation unit works with the keyboard", async ({ page }) => {
    await page.goto("/doc/trouver-la-page-d-inscription")
    const link = page.getByRole("link", { name: /^Voir la vidéo\s: Trouver et lire la page d’inscription \(\d+ min\)$/ })
    await link.focus()
    await expect(link).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/videos\/VOLUNTEER_DISCOVER_EVENT\?from=doc$/)
  })
})
