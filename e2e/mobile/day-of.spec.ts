import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"

/**
 * One-tap check-in on « Jour J » (#561) by touch, on the WebKit engine with iPhone emulation
 * (project "webkit-iphone"). WebKit does not focus a tapped button: the page puts the focus back
 * on the button just toggled, which stays the same element, and announces the new state.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const TIME_ZONE = "Europe/Zurich"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).tap()
  await expect(page).toHaveURL(/\/admin\/events/)
}

test("tapping « Présent » then « Annuler la présence » toggles the mark and keeps the focus on the button", async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const stamp = Date.now()
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE })
  const event = await (await page.request.post("/api/admin/events", {
    data: { title: `E2E Jour J mobile ${stamp}`, startDate: today, endDate: today, publicStatus: "draft" },
  })).json()
  const shift = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Accueil", label: "Accueil", date: today, startTime: "00:00", endTime: "23:59", capacity: 2 },
  })).json()
  const reg = await page.request.post("/api/admin/registrations", {
    data: { eventId: event.id, shiftId: shift.id, firstName: "Anne", lastName: `Roy${stamp}`, email: `e2e-dayof-mobile-${stamp}@example.com`, phone: "079 111 22 33" },
  })
  expect(reg.ok(), await reg.text()).toBeTruthy()

  await page.goto(`/admin/events/${event.id}/day-of`)
  const name = `Anne Roy${stamp}`
  const present = page.getByRole("button", { name: `Marquer présent, ${name}` })
  await waitForHydration(present)

  await present.tap()
  const undo = page.getByRole("button", { name: `Annuler la présence, ${name}` })
  await expect(undo).toBeFocused()
  await expect(page.getByRole("status")).toHaveText(`Présence enregistrée pour ${name}. Accueil : 1 présent sur 1 attendu.`)
  await expect(page.getByText("Présent", { exact: true })).toBeVisible()

  await undo.tap()
  await expect(present).toBeFocused()
  await expect(page.getByRole("status")).toHaveText(`Présence annulée pour ${name}. Accueil : 0 présent sur 1 attendu.`)
  await expect(page.getByText("Pas encore marqué", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})
