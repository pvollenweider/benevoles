import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { translatePage } from "./helpers/translator"
import { createPublicEvent, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * Public pages keep working once the browser has translated them (Sentry BENEVOLAPP-Z, 2026-10-31).
 * Google Translate swaps React's text nodes for <font> elements; choosing a second shift made React
 * insert the « x » of « nouveaux créneaux » before a text node the translator had removed, which
 * threw `NotFoundError` and replaced the page with Next's « Application error » screen: the
 * volunteer could no longer sign up. The translator is simulated by e2e/helpers/translator.ts; the
 * fix is src/lib/translation-dom-guard.ts and src/lib/continue-label.ts.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Page traduite ${Date.now()}`, [
    { label: "Bar", startTime: "08:00", endTime: "10:00" },
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: "Accueil", startTime: "13:00", endTime: "15:00", capacity: 2 },
    { label: "Buvette", startTime: "18:00", endTime: "22:00" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000)
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

/**
 * The page's uncaught errors, and the errors React logs when an error boundary catches one (the
 * « Application error » screen is such a boundary: no `pageerror` then). Failed resource loads
 * (a missing image) are not script errors and are left out.
 */
function pageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(`${e.name}: ${e.message}`))
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text())
  })
  return errors
}

test("a translated sign-up page keeps working: bars, views, the selection and the form", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto(`/${event.slug}?org=default`)
  await waitForHydration(page.getByRole("button", { name: /^08h–10h \d+\/\d+, Bar : sélectionner/ }))
  await translatePage(page)

  // No two shifts overlap, so every bar can be chosen. Every bar chosen, then dropped again: the
  // « Continuer » button goes from one shift to several (the click that broke the page) and back,
  // the recap grows and shrinks.
  const bars = page.locator("[data-shift-id]")
  const count = await bars.count()
  expect(count).toBe(4)
  for (let i = 0; i < count; i++) await bars.nth(i).click()
  // Written as one string, the label is rewritten whole: the new count shows on the translated page
  // (in either case: the translator may already have translated it again).
  const cta = page.locator("button[data-continue]:visible").first()
  await expect(cta).toHaveText(/^continuer \(4 nouveaux créneaux\)$/i)
  for (let i = 0; i < count; i++) await bars.nth(i).click()
  await expect(page.locator("button[data-continue]")).toHaveCount(0)
  await bars.nth(0).click()
  await bars.nth(2).click()
  await expect(cta).toHaveText(/^continuer \(2 nouveaux créneaux\)$/i)

  // List view and back.
  await page.getByRole("button", { name: /^liste$/i }).click()
  const frise = page.getByRole("region", { name: /^Planning du / })
  await expect(frise).toHaveCount(0)
  await page.getByRole("button", { name: /^frise$/i }).click()
  await expect(frise).toHaveCount(1)

  // The form opens, and the page is still the page.
  await cta.click()
  await expect(page.getByLabel(/^prénom/i)).toBeVisible()
  await expect(page.getByText(/application error/i)).toHaveCount(0)
  expect(errors).toEqual([])
})

test("a translated home page keeps working", async ({ page }) => {
  const errors = pageErrors(page)
  for (const url of ["/?org=default", "/"]) {
    await page.goto(url)
    await translatePage(page)
    await expect(page.locator("main").first()).toBeVisible()
    await expect(page.getByText(/application error/i)).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
