import { test, expect } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"
import { createPublicEvent, randomIp, type PublicEvent } from "../helpers/public-signup"

/**
 * « Liste » on a 320 px screen (#808): the shifts without horizontal scrolling, chosen with the
 * keyboard, and the choice kept after a reload. Project "webkit-iphone".
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Liste ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 3 },
    { label: "Accueil", startTime: "08:00", endTime: "09:30", capacity: 2 },
  ])
})

test("the list fits 320 px, selects with the keyboard, and stays chosen", async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 640 })
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await page.goto(`/${event.slug}?org=default`)

  const liste = page.getByRole("button", { name: "Liste" })
  await waitForHydration(liste)
  await expect(page.getByRole("button", { name: "Frise" })).toHaveAttribute("aria-pressed", "true")
  await liste.click()
  await expect(liste).toHaveAttribute("aria-pressed", "true")

  const list = page.getByRole("list", { name: /^Créneaux du / })
  const items = list.getByRole("button")
  await expect(items.first()).toHaveAccessibleName(/^08h–09h30 · Accueil/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  const bar = list.getByRole("button", { name: /^10h–12h · Bar/ })
  await bar.focus()
  await page.keyboard.press("Enter")
  await expect(bar).toHaveAttribute("aria-pressed", "true")

  await page.reload()
  await expect(page.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("list", { name: /^Créneaux du / })).toBeVisible()
})
