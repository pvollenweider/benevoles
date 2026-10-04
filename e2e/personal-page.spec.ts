import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"
import { clearMailbox, waitForMessage, getMessageText } from "./helpers/mailpit"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"

/**
 * Withdrawing from the personal page (/my) with the keyboard (#534): the confirmation takes focus,
 * Escape and « Non, garder » give it back to the trigger, a withdrawal moves focus to a neighbouring
 * card and announces the result once, a failure keeps the page and says so under the card. Also axe
 * on the page, confirmation closed and open, and the cards at 320 px.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Page perso ${Date.now()}`, [
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

/** Signs up for every shift of the event and opens the personal page, hydrated. */
async function openMyPage(page: Page) {
  const token = await publicSignUp(page, event, event.shifts.map((s) => s.id))
  await page.goto(`/my/${token}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
  await waitForHydration(trigger(page, "Bar"))
}

const trigger = (page: Page, label: string) => page.getByRole("button", { name: `Annuler le créneau ${label}` })
const keep = (page: Page) => page.getByRole("button", { name: "Non, garder" })
const pageStatus = (page: Page) => page.locator("#withdraw-status")

test("withdrawing with the keyboard: focus in the confirmation, back on the trigger, then on the next card", async ({ page }) => {
  await openMyPage(page)
  const bar = trigger(page, "Bar")

  // 1. Opening: the trigger stays, focus on « Non, garder ».
  await bar.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("alertdialog", { name: "Confirmer l'annulation ?" })
  await expect(dialog).toBeVisible()
  await expect(keep(page)).toBeFocused()
  await expect(bar).toHaveAttribute("aria-expanded", "true")

  // 2. Escape, then « Non, garder »: focus back on the trigger.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(bar).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(keep(page)).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(bar).toBeFocused()

  // 3 and 4. « Oui, annuler »: the card goes, focus on the next card's trigger, result announced.
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByRole("button", { name: "Oui, annuler" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(bar).toHaveCount(0)
  await expect(trigger(page, "Accueil")).toBeFocused()
  await expect(pageStatus(page)).toHaveText(/^Créneau annulé : Bar, mardi 1 octobre, de 10h à 12h\.$/)

  // The last card of the list: focus on the previous one.
  await trigger(page, "Vestiaire").focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Enter")
  await expect(trigger(page, "Vestiaire")).toHaveCount(0)
  await expect(trigger(page, "Accueil")).toBeFocused()
  await expect(pageStatus(page)).toHaveText(/^Créneau annulé : Vestiaire, /)

  // 5. The last registration: the empty view's heading takes focus, the result is still voiced.
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { level: 1, name: "Toutes tes inscriptions ont été annulées" })).toBeFocused()
  await expect(pageStatus(page)).toHaveText(/^Créneau annulé : Accueil, /)
})

test("a message left on withdrawal reaches the organizer's email (#559)", async ({ page }) => {
  await clearMailbox()
  await openMyPage(page)
  const bar = trigger(page, "Bar")
  await bar.click()
  await expect(keep(page)).toBeFocused()

  const message = `Je suis malade, Paul peut me remplacer ${Date.now()}`
  await page.getByLabel("Un mot pour l'organisation ? (facultatif)").fill(message)
  await page.getByRole("button", { name: "Oui, annuler" }).click()
  await expect(bar).toHaveCount(0)

  const mail = await waitForMessage(`to:"${ORG_ADMIN_EMAIL}" subject:"Désistement"`)
  const text = await getMessageText(mail.ID)
  expect(text).toContain(message)
})

test("a failed withdrawal keeps the page, says so under the card and gives focus back to the trigger", async ({ page }) => {
  await openMyPage(page)
  await page.route("**/api/public/registrations/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Erreur" }) })
      : route.fallback(),
  )
  const bar = trigger(page, "Bar")
  await bar.focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Enter")

  const alert = page.locator("[id^='withdraw-error-']").filter({ hasText: /./ })
  await expect(alert).toHaveText("L'annulation n'a pas abouti : rien n'a été annulé. Réessaie dans un moment.")
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute("role", "alert")
  await expect(bar).toBeFocused()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
  await expect(page.getByText("Ce lien ne fonctionne pas")).toHaveCount(0)
  await expect(pageStatus(page)).toHaveText("")
})

test("/my has no serious axe violation, confirmation closed and open", async ({ page }) => {
  await openMyPage(page)
  expect.soft(await seriousViolations(page)).toEqual([])
  await trigger(page, "Bar").click()
  await expect(keep(page)).toBeFocused()
  expect.soft(await seriousViolations(page)).toEqual([])
})

test.describe("at 320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("cards fit: no horizontal scroll, each trigger whole and in the viewport", async ({ page }) => {
    await openMyPage(page)
    const root = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(root.scroll).toBeLessThanOrEqual(root.client)
    for (const { label } of event.shifts) {
      const button = trigger(page, label)
      await button.scrollIntoViewIfNeeded()
      const box = await button.boundingBox()
      expect(box, label).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(320)
      expect(box!.height).toBeGreaterThanOrEqual(24)
      // Not truncated: the label fits in its box.
      const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      expect(clipped, label).toBe(false)
    }
    // The confirmation fits too.
    await trigger(page, "Bar").click()
    const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(after).toBeLessThanOrEqual(0)
    for (const name of [/^Oui, /, "Non, garder"]) {
      const box = await page.getByRole("alertdialog").getByRole("button", { name }).boundingBox()
      expect(box, String(name)).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(320)
      expect(box!.height).toBeGreaterThanOrEqual(24)
    }
  })
})
