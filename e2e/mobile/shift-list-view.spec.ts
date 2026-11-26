import { test, expect } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "../helpers/public-signup"

/**
 * « Liste » on a 320 px screen (#808): shown first with no choice (#1407), the shifts without
 * horizontal scrolling, chosen with the keyboard; « Frise » chosen is kept after a reload. Project
 * "webkit-iphone".
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Liste ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 3 },
    { label: "Accueil", startTime: "08:00", endTime: "09:30", capacity: 2 },
    // Full without a waiting list, inside the same 08h–12h day so the timeline's readable width
    // does not change: the quiet row this spec reads the accessible name of.
    { label: "Caisse", startTime: "09:00", endTime: "11:00", capacity: 1 },
  ])
  const other = await browser.newPage()
  await other.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await publicSignUp(other, event, [event.shifts[2].id])
  await other.close()
})

test("the list comes first at 320 px, fits, selects with the keyboard; a chosen Frise stays", async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await page.goto(`/${event.slug}?org=default`)

  const liste = page.getByRole("button", { name: "Liste" })
  await waitForHydration(liste)
  await expect(liste).toHaveAttribute("aria-pressed", "true")

  const list = page.getByRole("list", { name: /^Créneaux du / })
  const items = list.getByRole("button")
  await expect(items.first()).toHaveAccessibleName(/^08h–09h30 · Accueil/)
  // A quiet row is a flex container: a whitespace-only text node between its title and state has
  // no box there, so the space in the accessible name is checked in a real browser, not jsdom.
  const complet = list.getByRole("button", { name: /^09h–11h · Caisse\W+Complet$/ })
  await expect(complet).toHaveAccessibleName(/^09h–11h · Caisse\W+Complet$/)
  await expect(complet).toHaveAttribute("aria-disabled", "true")
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const bar = list.getByRole("button", { name: /^10h–12h · Bar/ })
  await bar.focus()
  await page.keyboard.press("Enter")
  await expect(bar).toHaveAttribute("aria-pressed", "true")

  // Not a choice: nothing kept on the device yet.
  expect(await page.evaluate(() => localStorage.getItem("benevoles:public-shift-view"))).toBeNull()

  await page.getByRole("button", { name: "Frise" }).click()
  await page.reload()
  await expect(page.getByRole("button", { name: "Frise" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("region", { name: /^Planning du / })).toBeVisible()
})

test("turned sideways, the phone shows the Frise", async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await page.goto(`/${event.slug}?org=default`)
  const frise = page.getByRole("button", { name: "Frise" })
  await waitForHydration(frise)
  await expect(frise).toHaveAttribute("aria-pressed", "true")
  // Held upright again at 390 px: this small day (08h–12h, shortest shift 1 h 30) stays readable
  // there (from 321 px, src/lib/frise-geometry.ts), so the Frise remains the default.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(frise).toHaveAttribute("aria-pressed", "true")
  // Under its readable width, the list.
  await page.setViewportSize({ width: 320, height: 640 })
  await expect(page.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("list", { name: /^Créneaux du / })).toBeVisible()
})
