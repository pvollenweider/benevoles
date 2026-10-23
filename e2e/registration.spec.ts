import { test, expect } from "@playwright/test"
import { clearMailbox, waitForMessage, getMessageText } from "./helpers/mailpit"
import { waitForHydration } from "./helpers/hydration"

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

test.beforeEach(async () => {
  // Emails go through a busy dev server and Mailpit in CI: allow up to 90 s (#592).
  test.slow()
  await clearMailbox()
})

test("volunteer registers for a shift, gets confirmation, org admin gets notified", async ({ page }) => {
  const volunteerEmail = `e2e-volunteer-${Date.now()}@example.com`

  await page.goto("/spectacle-cirque-2026?org=default")

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

  await expect(page).toHaveURL(/\/spectacle-cirque-2026\/success/)

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

// #1047: a second sign-up with the same address gets the common duplicate answer, which says how
// to get the link back, and the bounded fields can't take more than their limit.
test("signing up again with the same address explains how to get the link back", async ({ browser }) => {
  const email = `e2e-dup-${Date.now()}@example.com`
  async function signUp() {
    // A fresh context each time: nothing remembered from the first sign-up.
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto("/spectacle-cirque-2026?org=default")
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

  await expect((await signUp())).toHaveURL(/\/spectacle-cirque-2026\/success/)

  const again = await signUp()
  const alert = again.locator("#signup-failure")
  await expect(alert).toBeFocused()
  await expect(alert).toContainText("Inscription déjà enregistrée")
  await expect(alert).toContainText("une inscription ou une place en liste d'attente")
  await expect(alert).toContainText("Vérifie ta boîte de réception")
  await expect(alert.getByRole("button", { name: "Revenir au planning" })).toBeVisible()
  await again.screenshot({ path: test.info().outputPath("duplicate.png"), fullPage: false })
})

// #1097: no dead end after a public sign-up. The confirmation says where the personal link is
// (never on screen without proof of the address, #285) and goes back to the event, where a
// visitor without a session can ask for the link again; the answer is the same for any address.
test("after a public sign-up, back to the event and the lost link asked again by email", async ({ browser }) => {
  const email = `e2e-lost-${Date.now()}@example.com`
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/spectacle-cirque-2026?org=default")
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
  await expect(page).toHaveURL(/\/spectacle-cirque-2026\/success/)

  await expect(page.getByText("L'email de confirmation contient ton lien personnel")).toBeVisible()
  await expect(page.getByRole("link", { name: /^En savoir plus sur ton lien personnel/ })).toHaveAttribute("href", "/doc/lien-personnel")
  await expect(page.getByRole("link", { name: /Accéder à mon inscription/ })).toHaveCount(0)
  await expect(page.getByRole("link", { name: /Retour à l.accueil/ })).toHaveCount(0)
  await page.getByRole("link", { name: "Revenir à l'événement" }).click()
  await expect(page).toHaveURL(/\/spectacle-cirque-2026\?org=default$/)
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
