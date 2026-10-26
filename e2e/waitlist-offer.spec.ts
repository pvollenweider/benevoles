import { test, expect } from "@playwright/test"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * The waitlist offer link (#1044): opening it, scripts included, accepts nothing (mail scanners
 * open links); a GET on the API does nothing either; only the page's « Prendre la place » button
 * takes the spot.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("the offer page is read-only until « Prendre la place » is pressed", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)

  const stamp = Date.now()
  const event: { id: string } = await (await page.request.post("/api/admin/events", {
    data: { title: `E2E Offre ${stamp}`, startDate: "2030-11-02", endDate: "2030-11-02" },
  })).json()
  const shift: { id: string } = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Buvette", label: "Buvette", date: "2030-11-02", startTime: "14:00", endTime: "18:00", capacity: 1, waitlistEnabled: true },
  })).json()
  expect((await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })).ok()).toBeTruthy()

  const signup = (who: string) => page.request.post("/api/public/registrations", {
    headers: { "x-forwarded-for": `10.81.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    data: { eventId: event.id, shiftIds: [shift.id], firstName: "E2E", lastName: `${who}${stamp}`, email: `e2e-offer-${who.toLowerCase()}-${stamp}@example.com`, consent: true, charterAccepted: true },
  })
  expect((await signup("First")).ok()).toBeTruthy()
  const waiting = await signup("Next")
  expect((await waiting.json()).onWaitlist).toBe(true)

  // The first person withdraws: the spot is offered to the next one, by email.
  const firstMail = await waitForMessage(`to:"e2e-offer-first-${stamp}@example.com"`)
  const firstLink = (await getMessageText(firstMail.ID)).match(/\/my\/([\w-]+)/)?.[1] ?? ""
  expect(firstLink).toBeTruthy()
  expect((await page.request.delete(`/api/public/registrations/${firstLink}`, { headers: { "x-forwarded-for": `10.82.${Math.floor(Math.random() * 250)}.1` }, data: {} })).ok()).toBeTruthy()
  const offerMail = await waitForMessage(`to:"e2e-offer-next-${stamp}@example.com" subject:"Une place"`)
  const offerPath = (await getMessageText(offerMail.ID)).match(/\/waitlist\/[\w-]+\/confirm/)?.[0] ?? ""
  expect(offerPath, "the offer email carries the confirmation link").toBeTruthy()

  // A GET on the API, as a link scanner would send, changes nothing.
  expect((await page.request.get(`/api${offerPath.replace("/waitlist/", "/public/waitlist/")}`)).status()).toBe(405)

  // Opening the page twice (scripts run) leaves the offer standing.
  await page.goto(offerPath)
  await expect(page.getByRole("heading", { level: 1, name: "Une place s'est libérée" })).toBeVisible()
  await expect(page).toHaveTitle(/Place proposée/)
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "Une place s'est libérée" })).toBeVisible()

  await page.getByRole("button", { name: "Prendre la place" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Place confirmée !" })).toBeFocused()

  // Opening the link again says it is already done, without a button.
  await page.goto(offerPath)
  await expect(page.getByRole("heading", { level: 1, name: "Place déjà confirmée" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Prendre la place" })).toHaveCount(0)
})
