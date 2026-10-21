import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/**
 * Shift roster between volunteers (#1068): the organiser turns it on in Réglages (the reminder of
 * their duty to inform shows), the sign-up form then offers an optional, unticked box; a public
 * sign-up's acceptance waits for a confirmation from the personal page; once confirmed, another
 * confirmed volunteer of the event sees « Aline M. » on their personal page, until it is hidden.
 */

let event: PublicEvent
const title = `E2E Qui est inscrit ${Date.now()}`
const stamp = Date.now()
const alineEmail = `e2e-roster-aline-${stamp}@example.com`

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, title, [
    { label: "Buvette", startTime: "10:00", endTime: "12:00", capacity: 10 },
    { label: "Caisse", startTime: "14:00", endTime: "16:00", capacity: 10 },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(150_000) // dev server compiles each page on first visit, emails through Mailpit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function openMyPage(page: Page, token: string) {
  await page.goto(`/my/${token}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
}

const roster = (page: Page) => page.getByRole("region", { name: "Qui est inscrit" })

test("enable, sign up with the notice, confirm, seen by another volunteer, then hidden", async ({ page, browser }) => {
  // 1. Off by default: the sign-up form has no box.
  await page.goto(`/${event.slug}?org=default`)
  const select = page.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first()
  await waitForHydration(select)
  await select.click()
  await page.getByRole("button", { name: /^Continuer/ }).click()
  await expect(page.getByLabel("Prénom *", { exact: true })).toBeVisible()
  await expect(page.locator("#reg-roster")).toHaveCount(0)

  // 2. The organiser turns it on in Réglages: saved, and the duty to inform is said.
  const admin = await browser.newPage()
  await login(admin)
  await admin.goto(`/admin/events/${event.eventId}/edit`)
  const setting = admin.getByLabel("Montrer aux bénévoles confirmés qui est inscrit sur chaque créneau")
  await waitForHydration(setting)
  await expect(setting).not.toBeChecked()
  await setting.check()
  await expect(admin.getByText(/Informez les bénévoles/)).toBeVisible()
  await expect(admin.getByText(/Enregistré|Modifications enregistrées/).first()).toBeVisible({ timeout: 15_000 })
  await admin.close()

  // 3. A public sign-up: the optional box, unticked, separate from the required ones.
  await page.goto(`/${event.slug}?org=default`)
  const select2 = page.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first()
  await waitForHydration(select2)
  await select2.click()
  await page.getByRole("button", { name: /^Continuer/ }).click()
  await page.getByLabel("Prénom *", { exact: true }).fill("Aline")
  await page.getByLabel("Nom *", { exact: true }).fill("Martin")
  await page.getByLabel("Email *", { exact: true }).fill(alineEmail)
  await page.getByRole("button", { name: "convention des bénévoles" }).click()
  await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await page.getByLabel(/J.accepte que l.association/).check()
  const box = page.getByLabel(/J.accepte que les autres bénévoles confirmés de cet événement/)
  await expect(box).not.toBeChecked()
  await expect(box).toHaveAccessibleDescription(/Facultatif, sans effet sur ton inscription/)
  await box.check()
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(page).toHaveURL(new RegExp(`/${event.slug}/success`))
  const mail = await waitForMessage(`to:"${alineEmail}"`)
  const alineToken = (await getMessageText(mail.ID)).match(/\/my\/([\w-]+)/)?.[1] ?? ""
  expect(alineToken).toBeTruthy()

  // 4. Another confirmed volunteer of the event (on another shift): nobody shown yet, since a
  //    public form proves nothing about who sent it.
  const brunoToken = await publicSignUp(page, event, [event.shifts[1].id])
  await openMyPage(page, brunoToken)
  await expect(roster(page)).toBeVisible()
  await expect(roster(page)).not.toContainText("Aline")

  // 5. Aline confirms from her personal page (its link came by email).
  const alineContext = await browser.newContext()
  const aline = await alineContext.newPage()
  await aline.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await openMyPage(aline, alineToken)
  await expect(roster(aline)).toContainText("Tu as demandé à l'inscription d'afficher ton nom")
  const show = roster(aline).getByRole("button", { name: "Afficher mon nom" })
  await waitForHydration(show)
  expect(await seriousViolations(aline)).toEqual([])
  await show.click()
  const hide = roster(aline).getByRole("button", { name: "Masquer mon nom" })
  await expect(hide).toBeVisible()
  await expect(hide).toBeFocused()
  await expect(roster(aline)).toContainText("Ton nom est affiché")

  // 6. Bruno sees « Aline M. » under Buvette, never her full last name.
  await page.reload()
  await expect(roster(page).getByRole("heading", { level: 3, name: /Buvette/ })).toBeVisible()
  await expect(roster(page).getByRole("listitem")).toHaveText(["Aline M.Aline, initiale M"])
  await expect(roster(page)).not.toContainText("Martin")
  expect(await seriousViolations(page)).toEqual([])
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // 7. Aline hides her name: gone from Bruno's page.
  await hide.click()
  await expect(roster(aline).getByRole("button", { name: "Afficher mon nom" })).toBeVisible()
  await page.reload()
  await expect(roster(page)).toBeVisible()
  await expect(roster(page)).not.toContainText("Aline")
  await alineContext.close()
})
