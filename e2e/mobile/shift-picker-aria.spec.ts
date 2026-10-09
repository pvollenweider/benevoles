import { test, expect } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"
import { createPublicEvent, randomIp, type PublicEvent } from "../helpers/public-signup"

/**
 * ARIA snapshot of the public shift picker on a phone (#591, step 3), project "webkit-iphone":
 * a tapped bar is pressed, and the phone layout exposes the selection card and one « Continuer »
 * (the fixed one at the bottom), the desktop sidebar staying out of the tree. Playwright's
 * accessibility tree under WebKit, not VoiceOver on iOS.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Aria mobile ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 3 },
    { label: "Accueil", startTime: "14:00", endTime: "16:00", capacity: 2 },
  ])
})

test("a tapped bar is pressed; the selection card and one « Continuer » follow", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await page.goto(`/${event.slug}?org=default`)
  const region = page.getByRole("region", { name: "Planning du mardi 1 octobre" })
  const bar = region.getByRole("button", { name: /^10h–12h \d+\/\d+, Bar\b/ })
  await waitForHydration(bar)

  await expect(page.getByRole("main")).toMatchAriaSnapshot(`
    - main:
      - heading "mardi 1 octobre" [level=2]
      - paragraph: Fais défiler pour voir toutes les plages
      - region "Planning du mardi 1 octobre":
        - button /^10h–12h \\d+.\\d+, Bar\\W+sélectionner/ [pressed=false]
        - button /^14h–16h \\d+.\\d+, Accueil\\W+sélectionner/ [pressed=false]
  `)

  await bar.tap()
  await expect(page.getByRole("main")).toMatchAriaSnapshot(`
    - main:
      - region "Planning du mardi 1 octobre":
        - button /^10h–12h \\d+.3, Bar\\W+désélectionner \\(\\d+ places? libres? sur 3\\)$/ [pressed]
        - button /^14h–16h \\d+.\\d+, Accueil\\W+sélectionner/ [pressed=false]
      - button "Retirer Bar de la sélection"
      - button "Continuer (1 nouveau créneau)"
  `)
  await expect(page.getByRole("button", { name: /^Continuer/ })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Retirer Bar de la sélection" })).toHaveCount(1)
})
