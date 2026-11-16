import { test, expect } from "@playwright/test"
import { clearMailbox, waitForMessage, getMessageText } from "./helpers/mailpit"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, type PublicEvent } from "./helpers/public-signup"

/**
 * Covers the public registration flow end-to-end, including the regression
 * this suite exists to catch: the admin notification email must go to the
 * *organization's* admin(s), never to the global ADMIN_NOTIFICATION_EMAIL
 * fallback (see src/lib/notification-helpers.ts#sendAdminNotification). The e2e env sets
 * ADMIN_NOTIFICATION_EMAIL to an address distinct from the seeded org admin
 * specifically so this test fails loudly if that regresses.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const FALLBACK_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? "fallback-should-not-receive@localhost"

// An event of the default organisation still to come: the seeded demo event's shifts are over, and
// a shift that is over can't be taken.
let demo: PublicEvent
const demoPath = () => `/${demo.slug}?org=default`
const successUrl = () => new RegExp(`/${demo.slug}/success`)
test.beforeAll(async ({ browser }) => {
  demo = await createPublicEvent(browser, `E2E Inscription ${Date.now()}`, [
    { label: "Billetterie", startTime: "09:00", endTime: "12:00", capacity: 10 },
    { label: "Démontage", startTime: "18:00", endTime: "21:00", capacity: 10 },
  ])
})

test.beforeEach(async () => {
  // Emails go through a busy dev server and Mailpit in CI: allow up to 90 s (#592).
  test.slow()
  await clearMailbox()
})

test("volunteer registers for a shift, gets confirmation, org admin gets notified", async ({ page }) => {
  const volunteerEmail = `e2e-volunteer-${Date.now()}@example.com`

  await page.goto(demoPath())

  // A click before hydration selects nothing (#592).
  const select = page.getByRole("button", { name: /, Billetterie[^:]* : sélectionner/ }).first()
  await waitForHydration(select)
  await select.click()
  await page.getByRole("button", { name: /^Continuer/ }).click()

  await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await page.getByLabel("Nom *", { exact: true }).fill("Test")
  await page.getByLabel("Email *", { exact: true }).fill(volunteerEmail)

  await page.getByRole("button", { name: "convention des bénévoles" }).click()
  await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await page.getByLabel(/J.accepte que l.association/).check()
  // The consent says where retention and rights are explained, in a new tab so the form stays (#706).
  const privacy = page.getByRole("link", { name: /Mes droits et combien de temps mes données sont gardées/ })
  await expect(privacy).toHaveAttribute("href", "/legal/privacy#droits")
  await expect(privacy).toHaveAttribute("target", "_blank")

  await page.getByRole("button", { name: "Confirmer mon inscription" }).click()

  await expect(page).toHaveURL(successUrl())

  // Volunteer confirmation email
  const confirmation = await waitForMessage(`to:"${volunteerEmail}"`)
  expect(confirmation.Subject).toBeTruthy()

  // Admin notification: must reach the seeded org admin, not the global fallback.
  const adminNotif = await waitForMessage(`to:"${ORG_ADMIN_EMAIL}"`)
  expect(adminNotif.Subject).toBeTruthy()

  const fallbackMessages = await import("./helpers/mailpit").then((m) =>
    m.searchMessages(`to:"${FALLBACK_EMAIL}"`)
  )
  expect(fallbackMessages).toHaveLength(0)

  const body = await getMessageText(adminNotif.ID)
  expect(body).toContain("E2E")
})

// A second sign-up with the same address, without proof that it is the submitter's (AUTHZ-01):
// the same page as any sign-up, nothing said about the address's registrations; its owner gets the
// reason and the link by email. The bounded fields can't take more than their limit (#1047).
test("signing up again with the same address: the same page, the reason and the link by email", async ({ browser }) => {
  const email = `e2e-dup-${Date.now()}@example.com`
  async function signUp() {
    // A fresh context each time: nothing remembered from the first sign-up.
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(demoPath())
    // Démontage: a shift no other spec fills (capacity 5).
    const select = page.getByRole("button", { name: /, Démontage[^:]* : sélectionner/ }).first()
    await waitForHydration(select)
    await select.click()
    await page.getByRole("button", { name: /^Continuer/ }).click()
    await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
    await page.getByLabel("Nom *", { exact: true }).fill("Doublon")
    await page.getByLabel("Email *", { exact: true }).fill(email)
    const phone = page.getByLabel(/^Téléphone/)
    await phone.fill("1".repeat(60))
    await expect(phone).toHaveValue("1".repeat(50))
    await page.getByLabel(/^Commentaire/).fill("x".repeat(2010))
    await expect(page.getByLabel(/^Commentaire/)).toHaveValue("x".repeat(2000))
    await page.getByRole("button", { name: "convention des bénévoles" }).click()
    await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
    await page.getByLabel(/J.accepte que l.association/).check()
    await page.getByRole("button", { name: "Confirmer mon inscription" }).click()
    return page
  }

  await expect((await signUp())).toHaveURL(successUrl())

  const again = await signUp()
  await expect(again).toHaveURL(successUrl())
  await expect(again.getByRole("heading", { level: 1, name: "Demande d'inscription reçue" })).toBeVisible()
  await expect(again.locator("#signup-failure")).toHaveCount(0)
  const notice = await waitForMessage(`to:"${email}" subject:"Demande d'inscription non enregistrée"`)
  const text = await getMessageText(notice.ID)
  expect(text).toContain("une inscription ou une place en liste d'attente")
  expect(text).toMatch(/\/my\/[\w-]+/)
  await again.screenshot({ path: test.info().outputPath("duplicate.png"), fullPage: false })
})

// #1097: no dead end after a public sign-up. The confirmation says where the personal link is
// (never on screen without proof of the address, #285) and goes back to the event, where a
// visitor without a session can ask for the link again; the answer is the same for any address.
test("after a public sign-up, back to the event and the lost link asked again by email", async ({ browser }) => {
  const email = `e2e-lost-${Date.now()}@example.com`
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(demoPath())
  const select = page.getByRole("button", { name: /, Démontage[^:]* : sélectionner/ }).first()
  await waitForHydration(select)
  await select.click()
  await page.getByRole("button", { name: /^Continuer/ }).click()
  await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await page.getByLabel("Nom *", { exact: true }).fill("Perdu")
  await page.getByLabel("Email *", { exact: true }).fill(email)
  await page.getByRole("button", { name: "convention des bénévoles" }).click()
  await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await page.getByLabel(/J.accepte que l.association/).check()
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(page).toHaveURL(successUrl())

  await expect(page.getByRole("heading", { level: 1, name: "Demande d'inscription reçue" })).toBeVisible()
  await expect(page.getByText(/Vérifie tes emails, y compris les courriers indésirables/)).toBeVisible()
  await expect(page.getByRole("link", { name: /^En savoir plus sur ton lien personnel/ })).toHaveAttribute("href", "/doc/lien-personnel")
  await expect(page.getByRole("link", { name: /Accéder à mon inscription/ })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /Retour à l.accueil/ })).toHaveCount(0)
  await page.getByRole("link", { name: "Revenir à l'événement" }).click()
  await expect(page).toHaveURL(new RegExp(`/${demo.slug}\\?org=default$`))
  await waitForMessage(`to:"${email}"`)

  const lost = page.getByText("J'ai perdu mon lien personnel")
  await waitForHydration(lost)
  await lost.click()
  const field = page.getByLabel(/Adresse email utilisée pour t.inscrire/)
  await field.fill(email)
  await page.getByRole("button", { name: "Recevoir mon lien par email" }).click()
  const answer = page.getByRole("status").filter({ hasText: "Si une inscription existe à cette adresse" })
  await expect(answer).toBeVisible()
  await expect(page.locator("a[href^='/my/']")).toHaveCount(0)
  // Which email leaves (one per upcoming event) is the route's, covered by
  // src/__tests__/personal-link-routes.test.ts: the seeded event is dated June 2026.

  // An address with no registration gets the very same answer, and no email.
  const unknown = `e2e-nobody-${Date.now()}@example.com`
  await field.fill(unknown)
  await page.getByRole("button", { name: "Recevoir mon lien par email" }).click()
  await expect(answer).toBeVisible()
  const { searchMessages } = await import("./helpers/mailpit")
  expect(await searchMessages(`to:"${unknown}"`)).toHaveLength(0)
  await context.close()
})
