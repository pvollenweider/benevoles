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
