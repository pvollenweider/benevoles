import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * #1116: the video library and the legal documents have the header of every public content page
 * (navigation, « Pour qui ? », theme toggle) and its dark theme. The choice is kept (doc-theme in
 * localStorage), scoped to the frame's root, never on <html>.
 */

const scopeIsDark = (page: Page) => page.locator("[data-theme-scope]").evaluate((el) => el.classList.contains("dark"))
const htmlIsDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains("dark"))

/** The names of the header's links and buttons, in order. */
async function headerControls(page: Page): Promise<string[]> {
  const banner = page.getByRole("banner")
  await expect(banner).toBeVisible()
  return banner.locator("a, button").evaluateAll((els) => els.map((e) => `${e.tagName}:${(e.getAttribute("aria-label") ?? e.textContent ?? "").replace(/, rubrique actuelle/, "").trim()}`))
}

test("the video, legal and other content pages share one header", async ({ page }) => {
  await page.goto("/doc")
  const reference = await headerControls(page)
  expect(reference).toContain("BUTTON:Thème sombre")
  for (const path of ["/videos", "/videos/EVENT_CREATE_BLANK", "/legal/privacy", "/legal/terms", "/blog", "/fonctionnalites"]) {
    await page.goto(path)
    expect(await headerControls(page), path).toEqual(reference)
  }
})

test("the theme chosen on the video library carries over to the legal pages, never on <html>", async ({ page }) => {
  await page.goto("/videos")
  const toggle = page.getByRole("banner").getByRole("button", { name: "Thème sombre" })
  await waitForHydration(toggle)
  await expect(toggle).toHaveAttribute("aria-pressed", "false")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-pressed", "true")
  expect(await scopeIsDark(page)).toBe(true)
  expect(await htmlIsDark(page)).toBe(false)

  // Client navigation through the footer: the frame remounts, the toggle applies the choice.
  await page.getByRole("contentinfo").getByRole("link", { name: "Confidentialité" }).click()
  await expect(page).toHaveURL(/\/legal\/privacy$/)
  await expect(page.getByRole("banner").getByRole("button", { name: "Thème sombre" })).toHaveAttribute("aria-pressed", "true")
  expect(await scopeIsDark(page)).toBe(true)
  expect(await htmlIsDark(page)).toBe(false)

  // A full load: the inline script applies it before the first paint.
  await page.reload()
  expect(await scopeIsDark(page)).toBe(true)
  expect(await htmlIsDark(page)).toBe(false)
  await page.goto("/videos/EVENT_CREATE_BLANK")
  expect(await scopeIsDark(page)).toBe(true)
})

test.describe("with a dark system preference", () => {
  test.use({ colorScheme: "dark" })

  test("follows it, and a saved light choice wins over it", async ({ page }) => {
    await page.goto("/legal/privacy")
    expect(await scopeIsDark(page)).toBe(true)
    await page.evaluate(() => localStorage.setItem("doc-theme", "light"))
    await page.goto("/videos")
    expect(await scopeIsDark(page)).toBe(false)
    await expect(page.getByRole("banner").getByRole("button", { name: "Thème sombre" })).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("moving between content pages in the dark theme", () => {
  test.use({ colorScheme: "dark" })

  /** Records, at every frame from now on, whether the content frame on screen is painted light. */
  const watchLightFrames = (page: Page) =>
    page.evaluate(() => {
      const w = window as unknown as { __lightFrames: number; __marker: string }
      w.__lightFrames = 0
      w.__marker = "same document"
      const lightness = (color: string) => {
        const probe = document.createElement("canvas").getContext("2d")!
        probe.fillStyle = color
        probe.fillRect(0, 0, 1, 1)
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
        return (r + g + b) / 3
      }
      const loop = () => {
        const frame = document.querySelector("[data-theme-scope]")
        if (frame && lightness(getComputedStyle(frame).backgroundColor) > 128) w.__lightFrames++
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    })
  const lightFrames = (page: Page) => page.evaluate(() => (window as unknown as { __lightFrames: number }).__lightFrames)
  const sameDocument = (page: Page) => page.evaluate(() => (window as unknown as { __marker?: string }).__marker === "same document")
  const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

  test("a guide's own links open the page client-side, focus in the content, never a light frame", async ({ page }) => {
    await page.goto("/doc/admin")
    await waitForHydration(page.getByRole("banner").getByRole("button", { name: "Thème sombre" }))
    expect(await canvas(page)).not.toBe("rgba(0, 0, 0, 0)")
    await watchLightFrames(page)

    // A link of the rendered Markdown (not a next/link), activated with the keyboard.
    const link = page.getByRole("main").locator('article a[href^="/doc/"]:not([href*="#"])').first()
    const href = await link.getAttribute("href")
    await link.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.getByRole("main")).toBeFocused()
    expect(await sameDocument(page)).toBe(true)

    // Into another section, whose frame is a new one: still dark from its first frame.
    await page.getByRole("banner").getByRole("link", { name: "Fonctionnalités" }).click()
    await expect(page).toHaveURL(/\/fonctionnalites$/)
    expect(await scopeIsDark(page)).toBe(true)
    expect(await sameDocument(page)).toBe(true)
    expect(await lightFrames(page)).toBe(0)

    // Back to the home page: the dark canvas goes with the frame.
    await page.getByRole("banner").getByRole("link", { name: "benevol.app" }).click()
    await expect(page).toHaveURL(/\/$/)
    expect(await canvas(page)).toBe("rgba(0, 0, 0, 0)")
    expect(await htmlIsDark(page)).toBe(false)
  })

  test("a guide's link to a section of another page focuses that section", async ({ page }) => {
    await page.goto("/doc/admin")
    await waitForHydration(page.getByRole("banner").getByRole("button", { name: "Thème sombre" }))
    const link = page.getByRole("main").locator('article a[href^="/doc/"][href*="#"]').first()
    const href = (await link.getAttribute("href"))!
    await link.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    const id = decodeURIComponent(href.slice(href.indexOf("#") + 1))
    await expect(page.locator(`[id="${id}"]`)).toBeFocused()
  })
})
