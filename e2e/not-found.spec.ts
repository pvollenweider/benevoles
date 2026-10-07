import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The 404 page (src/app/not-found.tsx): a real 404 status, « Cette page est tombée à l'eau. » and
 * the useful links, on the apex and on an organization (`?org=`, as the other specs address it);
 * no serious axe violation in light and dark; no animation left with reduced motion; no
 * horizontal scroll at 320 px.
 */

const H1 = "Cette page est tombée à l'eau."

async function expectNotFoundPage(page: Page) {
  await expect(page).toHaveTitle("Page introuvable | benevol.app")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(H1)
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
  await expect(page.getByRole("navigation", { name: "Liens utiles" })).toBeVisible()
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/)
}

test("an unknown URL on the apex answers 404 with the page and its main links", async ({ page }) => {
  const response = await page.goto("/cette-page-n-existe-pas")
  expect(response?.status()).toBe(404)
  await expectNotFoundPage(page)
  await expect(page.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/")
  const nav = page.getByRole("navigation", { name: "Liens utiles" })
  for (const [name, href] of [
    ["Fonctionnalités", "/fonctionnalites"],
    ["Documentation", "/doc"],
    ["Guide bénévole", "/doc/benevole"],
    ["Guide des organisateurs", "/doc/admin"],
    ["Tutoriels vidéo", "/videos"],
    ["Espace organisateur", "/admin/login"],
  ]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href)
  }
})

test("a deeper unknown URL, an unknown documentation unit and an unknown video answer the same page", async ({ page }) => {
  for (const path of ["/n-existe/pas/du-tout", "/doc/unite-inexistante", "/videos/VIDEO_INEXISTANTE"]) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
    await expectNotFoundPage(page)
  }
  // The documentation's own frame is not drawn around it: one main, no theme toggle.
  await page.goto("/doc/unite-inexistante")
  await expect(page.getByRole("main")).toHaveCount(1)
  await expect(page.getByRole("button", { name: /thème/i })).toHaveCount(0)
})

test("on an organization: an unknown event leads back to its events", async ({ page }) => {
  const response = await page.goto("/evenement-inexistant?org=default")
  expect(response?.status()).toBe(404)
  await expectNotFoundPage(page)
  const back = page.getByRole("link", { name: "Voir les événements" })
  await expect(back).toHaveAttribute("href", "/?org=default")
  await expect(page.getByText(/le lien personnel se trouve dans l'e-mail de confirmation/)).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(/\/\?org=default$/)
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(H1)
})

test("on an organization: an unknown documentation unit too", async ({ page }) => {
  const response = await page.goto("/doc/unite-inexistante?org=default")
  expect(response?.status()).toBe(404)
  await expectNotFoundPage(page)
  await expect(page.getByRole("link", { name: "Voir les événements" })).toHaveAttribute("href", "/?org=default")
})

// An unknown organisation (a mistyped or deleted subdomain) is a real 404, not a copy of the
// marketing home that search engines would index (#759); its links are the apex ones.
test("an unknown organisation answers 404, not the marketing home", async ({ page }) => {
  const response = await page.goto("/?org=organisation-inexistante")
  expect(response?.status()).toBe(404)
  await expectNotFoundPage(page)
  await expect(page.getByRole("link", { name: "Voir les événements" })).toHaveCount(0)
})

for (const colorScheme of ["light", "dark"] as const) {
  test(`no serious violation (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto("/cette-page-n-existe-pas")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    // The page follows the system: a dark background in dark mode, a light one otherwise.
    const lightness = await page.locator("[data-color-scheme]").evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor
      // Chromium reports Tailwind's colours as lab() (L from 0 to 100) or oklch() (L from 0 to 1).
      const lab = bg.match(/^lab\(([\d.]+)/)
      if (lab) return Number(lab[1]) / 100
      const oklch = bg.match(/^oklch\(([\d.]+)/)
      if (oklch) return Number(oklch[1])
      const [r, g, b] = (bg.match(/[\d.]+/g) ?? []).map(Number)
      return (r + g + b) / 765
    })
    if (colorScheme === "dark") expect(lightness).toBeLessThan(0.4)
    else expect(lightness).toBeGreaterThan(0.9)
    expect.soft(await seriousViolations(page)).toEqual([])
  })
}

test("the rain falls, unless reduced motion is asked for", async ({ page }) => {
  await page.goto("/cette-page-n-existe-pas")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0)

  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.reload()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
  // Still raining, only still: the drops stay drawn.
  await expect(page.locator("[data-rain-drop]").first()).toBeAttached()
})

test.describe("on a 320 px phone", () => {
  test.use({ viewport: { width: 320, height: 640 } })
  for (const colorScheme of ["light", "dark"] as const) {
    test(`no horizontal scroll, no serious violation (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto("/cette-page-n-existe-pas")
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
      expect.soft(await seriousViolations(page)).toEqual([])
    })
  }
})
