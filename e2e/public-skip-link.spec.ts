import { test, expect, type Page } from "@playwright/test"

/**
 * Skip link on the public pages (#534): the first Tab reveals « Aller au contenu », visible and
 * focused; Enter moves the focus to the main landmark, past the header. On the event page the
 * header (title, session) is a banner outside main, and the footer is outside it too.
 */

async function firstTabThenEnter(page: Page) {
  const link = page.getByRole("link", { name: "Aller au contenu" })
  await expect(link).not.toBeInViewport()
  await page.keyboard.press("Tab")
  await expect(link).toBeFocused()
  await expect(link).toBeVisible()
  await expect(link).toBeInViewport()

  await page.keyboard.press("Enter")
  await expect(page.locator("main#main")).toBeFocused()
}

test("legal pages: the first Tab reveals a skip link that focuses the main content", async ({ page }) => {
  await page.goto("/legal/privacy")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  // The shared public footer, after </main> (a footer inside main loses its contentinfo role).
  await expect(page.locator("main footer")).toHaveCount(0)
  await expect(page.getByRole("contentinfo")).toHaveCount(1)
  await expect(page.getByRole("contentinfo").getByRole("navigation", { name: "Liens utiles" })).toBeVisible()
  await firstTabThenEnter(page)
})

test("public event page: skip link to main, header outside main", async ({ page }) => {
  await page.goto("/spectacle-cirque-2026?org=default")
  // Client-rendered: wait for the event (and hydration) before the first Tab.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("link", { name: "Aller au contenu" })).toHaveCount(1)

  const banner = page.getByRole("banner")
  await expect(banner).toHaveCount(1)
  await expect(banner.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.locator("main header")).toHaveCount(0)
  await expect(page.locator("main")).toHaveCount(1)
  await expect(page.locator("main footer")).toHaveCount(0)
  await expect(page.getByRole("contentinfo")).toHaveCount(1)

  await firstTabThenEnter(page)
  // The next Tab goes on into the content, not back to the header.
  await page.keyboard.press("Tab")
  const inMain = await page.evaluate(() => !!document.activeElement?.closest("main#main"))
  expect(inMain).toBe(true)
})
