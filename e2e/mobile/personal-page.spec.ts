import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "../helpers/public-signup"

/**
 * Withdrawing from the personal page by touch, on the WebKit engine with iPhone emulation (project
 * "webkit-iphone"), #534. WebKit does not focus a tapped button, so focus only lands where the page
 * puts it: in the confirmation when it opens, on the trigger when it closes, on the next card after
 * a withdrawal; never on <body>.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Page perso mobile ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: "Accueil", startTime: "14:00", endTime: "16:00" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

const trigger = (page: Page, label: string) => page.getByRole("button", { name: `Annuler le créneau ${label}` })

test("tapping « Annuler », « Non, garder », then « Oui, annuler » moves focus where it belongs", async ({ page }) => {
  const token = await publicSignUp(page, event, event.shifts.map((s) => s.id))
  await page.goto(`/my/${token}`)
  const bar = trigger(page, "Bar")
  await waitForHydration(bar)

  await bar.tap()
  const keep = page.getByRole("button", { name: "Non, garder" })
  await expect(keep).toBeFocused()

  await keep.tap()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect(bar).toBeFocused()

  await bar.tap()
  await page.getByRole("button", { name: "Oui, annuler" }).tap()
  await expect(bar).toHaveCount(0)
  await expect(page.locator("#withdraw-status")).toHaveText(/^Créneau annulé : Bar, /)
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(false)
  await expect(trigger(page, "Accueil")).toBeFocused()
})
