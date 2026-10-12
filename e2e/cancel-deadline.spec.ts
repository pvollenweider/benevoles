import { test, expect, type Browser, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * Volunteer self-cancellation deadline (#946): set in the event settings; on the personal page,
 * the date while it is ahead, and the contacts to tell instead of the cancel button once it has
 * passed; a page loaded before the deadline gets the server's refusal and switches to the contacts.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const DAY_CONTACT = { name: "Léa coordination", phone: "079 000 11 22" }

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function patchEvent(browser: Browser, eventId: string, data: Record<string, unknown>) {
  const page = await browser.newPage()
  await login(page)
  const res = await page.request.patch(`/api/admin/events/${eventId}`, { data })
  expect(res.ok(), await res.text()).toBeTruthy()
  await page.close()
}

/** Tomorrow (UTC calendar day): its shifts have not started, a 2-day deadline has passed. */
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

let soon: PublicEvent
let later: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(150_000)
  soon = await createPublicEvent(browser, `E2E Délai proche ${Date.now()}`, [{ label: "Bar", startTime: "23:00", endTime: "23:30" }], tomorrow())
  await patchEvent(browser, soon.eventId, { cancelDeadlineDays: 2, dayContactName: DAY_CONTACT.name, dayContactPhone: DAY_CONTACT.phone })
  later = await createPublicEvent(browser, `E2E Délai lointain ${Date.now()}`, [{ label: "Accueil", startTime: "10:00", endTime: "12:00" }])
  await patchEvent(browser, later.eventId, { cancelDeadlineDays: 2, dayContactName: DAY_CONTACT.name, dayContactPhone: DAY_CONTACT.phone })
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000)
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

test("before the deadline: the cancel button, with the date it stays available", async ({ page }) => {
  const token = await publicSignUp(page, later, later.shifts.map((s) => s.id))
  await page.goto(`/my/${token}`)
  const trigger = page.getByRole("button", { name: "Annuler le créneau Accueil" })
  await expect(trigger).toBeVisible()
  // 2 days before 10:00 on 1 October 2030.
  await expect(page.getByText("Tu peux annuler toi-même jusqu'au dimanche 29 septembre à 10:00.")).toBeVisible()
})

test("past the deadline: no cancel button, why, and whom to tell", async ({ page }) => {
  const token = await publicSignUp(page, soon, soon.shifts.map((s) => s.id))
  await page.goto(`/my/${token}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
  const card = page.locator("[id^='cancel-closed-']")
  await expect(card).toContainText("Le délai pour annuler toi-même ce créneau est passé.")
  await expect(card).toContainText("Si tu ne peux pas venir, préviens directement :")
  await expect(card.getByRole("link", { name: `${DAY_CONTACT.name}, ${DAY_CONTACT.phone}` })).toHaveAttribute("href", "tel:0790001122")
  await expect(page.getByRole("button", { name: /^Annuler le créneau/ })).toHaveCount(0)
  expect.soft(await seriousViolations(page)).toEqual([])

  // The server refuses too, whatever the page shows (the source of truth).
  const res = await page.request.delete(`/api/public/registrations/${token}`, { headers: { "x-forwarded-for": randomIp() }, data: {} })
  expect(res.status()).toBe(409)
  expect((await res.json()).reason).toBe("deadline")
})

test("a page loaded before the deadline: the refusal is said, the card switches to the contacts", async ({ page }) => {
  const token = await publicSignUp(page, later, later.shifts.map((s) => s.id))
  await page.goto(`/my/${token}`)
  const trigger = page.getByRole("button", { name: "Annuler le créneau Accueil" })
  await waitForHydration(trigger)
  // The deadline passes while the page is open: answered as the server would.
  await page.route("**/api/public/registrations/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Le délai pour annuler toi-même ce créneau est passé : rien n'a été annulé. Préviens directement l'organisation ou le responsable du poste.", code: "cancel_closed", reason: "deadline" }) })
      : route.fallback(),
  )
  await trigger.click()
  await page.getByRole("button", { name: "Oui, annuler" }).click()

  const closed = page.locator("[id^='cancel-closed-']")
  await expect(closed).toBeFocused()
  await expect(closed).toContainText("Le délai pour annuler toi-même ce créneau est passé.")
  await expect(trigger).toHaveCount(0)
  const alert = page.locator("[id^='withdraw-error-']").filter({ hasText: /./ })
  await expect(alert).toHaveText(/^Le délai pour annuler toi-même ce créneau est passé : rien n'a été annulé\./)
  await expect(alert).toHaveAttribute("role", "alert")
})

test("the event settings: « Plus tôt » with days and hours, saved and read back", async ({ page }) => {
  await login(page)
  await page.goto(`/admin/events/${later.eventId}/edit`)
  const group = page.getByRole("group", { name: "Annulation par le bénévole" })
  await expect(group.getByRole("radio", { name: "Plus tôt : un délai avant le début de chaque créneau" })).toBeChecked()
  const days = group.getByRole("spinbutton", { name: "Jours" })
  await expect(days).toHaveValue("2")

  await days.fill("0")
  await group.getByRole("spinbutton", { name: "Heures" }).fill("0")
  await expect(days).toHaveAttribute("aria-invalid", "true")
  await expect(group.getByText("Indiquez au moins un jour ou une heure")).toBeVisible()

  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/admin/events/${later.eventId}`) && r.request().method() === "PATCH" && (r.request().postData() ?? "").includes(`"cancelDeadlineHours":6`))
  await group.getByRole("spinbutton", { name: "Heures" }).fill("6")
  await expect(days).not.toHaveAttribute("aria-invalid", "true")
  expect((await saved).ok()).toBe(true)
  await page.reload()
  await expect(page.getByRole("group", { name: "Annulation par le bénévole" }).getByRole("spinbutton", { name: "Heures" })).toHaveValue("6")

  await page.getByRole("radio", { name: "Jusqu'au début du créneau" }).check()
  await expect(page.getByRole("spinbutton", { name: "Jours" })).toHaveCount(0)
  expect.soft(await seriousViolations(page)).toEqual([])
})
