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
