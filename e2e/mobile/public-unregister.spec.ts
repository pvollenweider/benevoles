import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "../helpers/public-signup"

/**
 * Withdrawing a held shift from the public event page by touch, on the WebKit engine with iPhone
 * emulation (project "webkit-iphone"), #584. WebKit does not focus a tapped button, so focus only
 * lands where the page puts it: on « Non, garder » when the dialog opens, on the ✕ when it closes
 * without withdrawing, on a list row or the shift's bar after a withdrawal; never on <body>.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Désinscription mobile ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: "Accueil", startTime: "14:00", endTime: "16:00" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

const cancelX = (page: Page, label: string) => page.getByRole("button", { name: `Annuler le créneau ${label}` })

test("tapping ✕, « Non, garder », then ✕ and « Oui, annuler » moves focus where it belongs", async ({ page }) => {
  const token = await publicSignUp(page, event, event.shifts.map((s) => s.id))
  const url = `/${event.slug}?org=default`
  await page.goto(url)
  await page.evaluate(([slug, t]) => localStorage.setItem(`benevoles_token_${slug}`, t), [event.slug, token])
  await page.goto(url)
  const bar = cancelX(page, "Bar")
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
  await expect(page.locator("#action-notice")).toHaveText(/^Créneau annulé : Bar, /)
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(false)
  await expect(cancelX(page, "Accueil")).toBeFocused()
})
