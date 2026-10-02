import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * Withdrawing a held shift from the public event page with the keyboard (#584, #534): the
 * alertdialog traps focus and starts on « Non, garder », Escape gives focus back to the ✕, the
 * request keeps the dialog open, a success announces the result once and moves focus to a list
 * row or to the shift's bar (never <body>), a failure stays in the dialog and removes nothing.
 * Also the CTA's press scale, off with « reduce motion ».
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Désinscription ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00" },
    { label: "Accueil", startTime: "14:00", endTime: "16:00" },
    { label: "Vestiaire", startTime: "17:00", endTime: "19:00" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  // Its own client address: GET and DELETE on a personal token are rate limited per address.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

const publicUrl = () => `/${event.slug}?org=default`
const cancelX = (page: Page, label: string) => page.getByRole("button", { name: `Annuler le créneau ${label}` })
const dialog = (page: Page) => page.getByRole("alertdialog")
const notice = (page: Page) => page.locator("#action-notice")

/** Signs up for Bar and Accueil and opens the event page with that session, hydrated. */
async function openWithSession(page: Page) {
  const token = await publicSignUp(page, event, event.shifts.filter((s) => s.label !== "Vestiaire").map((s) => s.id))
  await page.goto(publicUrl())
  await page.evaluate(([slug, t]) => localStorage.setItem(`benevoles_token_${slug}`, t), [event.slug, token])
  await page.goto(publicUrl())
  await waitForHydration(cancelX(page, "Bar"))
}

test("withdrawing with the keyboard: trapped dialog, Escape back to the ✕, then focus on the next row", async ({ page }) => {
  await openWithSession(page)
  const bar = cancelX(page, "Bar")

  await bar.focus()
  await page.keyboard.press("Enter")
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toHaveAccessibleName("Confirmer l'annulation ?")
  await expect(page.getByRole("button", { name: "Non, garder" })).toBeFocused()
  // The trap: five Tabs never leave the dialog.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab")
    expect(await page.evaluate(() => !!document.activeElement?.closest("[role=alertdialog]")), `Tab ${i + 1}`).toBe(true)
  }
  expect.soft(await seriousViolations(page)).toEqual([])

  await page.keyboard.press("Escape")
  await expect(dialog(page)).toBeHidden()
  await expect(bar).toBeFocused()

  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Non, garder" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Oui, annuler" })).toBeFocused()
  await page.keyboard.press("Enter")

  await expect(dialog(page)).toBeHidden()
  await expect(bar).toHaveCount(0)
  await expect(notice(page)).toHaveText(/^Créneau annulé : Bar, mardi 1 octobre, de 10h à 12h\.$/)
  // Focus on the row now at the ✕'s place in the same list.
  await expect(cancelX(page, "Accueil")).toBeFocused()

  // The last row: the list goes, focus on the shift's bar, offered again.
  await page.keyboard.press("Enter")
  await page.keyboard.press("Tab")
  await page.keyboard.press("Enter")
  await expect(cancelX(page, "Accueil")).toHaveCount(0)
  await expect(notice(page)).toHaveText(/^Créneau annulé : Accueil, /)
  const focused = await page.evaluate(() => ({
    body: document.activeElement === document.body || document.activeElement === null,
    name: document.activeElement?.getAttribute("aria-label") ?? "",
    shiftId: document.activeElement?.getAttribute("data-shift-id"),
  }))
  expect(focused.body).toBe(false)
  expect(focused.shiftId).toBe(event.shifts.find((s) => s.label === "Accueil")!.id)
  expect(focused.name).toMatch(/^Sélectionner — Accueil/)
})

test("a failed withdrawal stays in the dialog, says why and removes nothing", async ({ page }) => {
  await openWithSession(page)
  await page.route("**/api/public/registrations/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Erreur" }) })
      : route.fallback(),
  )
  const bar = cancelX(page, "Bar")
  await bar.focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("Tab")
  const confirm = page.getByRole("button", { name: "Oui, annuler" })
  await expect(confirm).toBeFocused()
  await page.keyboard.press("Enter")

  const alert = dialog(page).getByRole("alert")
  await expect(alert).toHaveText("L'annulation n'a pas abouti : rien n'a été annulé. Réessaie dans un moment.")
  await expect(alert).toBeVisible()
  await expect(dialog(page)).toBeVisible()
  await expect(confirm).toBeFocused()
  await expect(confirm).not.toHaveAttribute("aria-disabled")
  await expect(bar).toHaveCount(1)
  await expect(notice(page)).toHaveText("")
})

test("the CTA's press scale is off with « reduce motion »", async ({ page }) => {
  await page.goto(publicUrl())
  const vestiaire = page.getByRole("button", { name: /^Sélectionner — Vestiaire/ })
  await waitForHydration(vestiaire)
  await vestiaire.click()
  const cta = page.getByRole("button", { name: /^Continuer/ })
  await expect(cta).toBeVisible()
  const pressedTransform = async () => {
    const box = (await cta.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(400) // past the 150 ms transition
    // Tailwind 4 scales with the CSS `scale` property, not `transform`.
    const transform = await cta.evaluate((el) => getComputedStyle(el).scale)
    await page.mouse.move(0, 0)
    await page.mouse.up()
    return transform
  }
  expect(await pressedTransform()).not.toBe("none")
  await page.emulateMedia({ reducedMotion: "reduce" })
  expect(await pressedTransform()).toBe("none")
})
