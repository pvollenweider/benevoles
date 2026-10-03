import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"

/**
 * Admin dialogs and the roles panel by touch, on the WebKit engine with iPhone emulation (project
 * "webkit-iphone"), #585. WebKit does not focus a tapped button: focus goes to the admin's
 * `<main tabIndex={-1}>`. Closing a dialog, or the rename editor of « Gérer les postes », must still
 * give focus back to the control that opened it, not leave it on `<main>`.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function logIn(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).tap()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function createEventWithShift(page: Page, title: string, registrations = 0) {
  const eventRes = await page.request.post("/api/admin/events", {
    data: { title, startDate: "2030-10-05", endDate: "2030-10-05", publicStatus: "draft" },
  })
  expect(eventRes.ok()).toBeTruthy()
  const event: { id: string } = await eventRes.json()
  const shiftRes = await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-05", startTime: "10:00", endTime: "12:00", capacity: 5 },
  })
  expect(shiftRes.ok()).toBeTruthy()
  const shift: { id: string } = await shiftRes.json()
  const stamp = Date.now()
  for (let i = 0; i < registrations; i++) {
    const res = await page.request.post("/api/admin/registrations", {
      data: { eventId: event.id, shiftId: shift.id, firstName: "E2E", lastName: `Tap${i}`, email: `e2e-tap-${stamp}-${i}@example.com` },
    })
    expect(res.ok()).toBeTruthy()
  }
  return event.id
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await logIn(page)
})

test("members: tapping « Annuler » in « Nouveau membre » gives focus back to « + Nouveau membre »", async ({ page }) => {
  await page.goto("/admin/members")
  const trigger = page.getByRole("button", { name: "+ Nouveau membre" })
  await waitForHydration(trigger)

  await trigger.tap()
  const dialog = page.getByRole("dialog", { name: "Nouveau membre" })
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Annuler" }).tap()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("members: tapping « Fermer » (×) gives focus back to « + Nouveau membre »", async ({ page }) => {
  await page.goto("/admin/members")
  const trigger = page.getByRole("button", { name: "+ Nouveau membre" })
  await waitForHydration(trigger)

  await trigger.tap()
  const dialog = page.getByRole("dialog", { name: "Nouveau membre" })
  await dialog.getByRole("button", { name: "Fermer" }).tap()
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("shifts: tapping « Annuler » in a role's rename gives focus back to its « Renommer »", async ({ page }) => {
  const eventId = await createEventWithShift(page, `E2E Focus WebKit postes ${Date.now()}`)
  await page.goto(`/admin/events/${eventId}/shifts`)
  const manage = page.getByRole("button", { name: "Gérer les postes" })
  await waitForHydration(manage)

  await manage.tap()
  const rename = page.getByRole("button", { name: "Renommer le poste Bar" })
  await rename.tap()
  const input = page.getByLabel("Nouveau nom du poste « Bar »")
  await expect(input).toBeVisible()
  await page.getByRole("button", { name: "Annuler", exact: true }).tap()
  await expect(input).toHaveCount(0)
  await expect(rename).toBeFocused()
})

test("registrations: tapping « Annuler » in the bulk confirmation gives focus back to the bulk button", async ({ page }) => {
  const eventId = await createEventWithShift(page, `E2E Focus WebKit inscriptions ${Date.now()}`, 1)
  await page.goto(`/admin/events/${eventId}/registrations`)
  const checkbox = page.getByLabel("Sélectionner l'inscription de E2E Tap0")
  await waitForHydration(checkbox)

  await checkbox.tap()
  const bulk = page.getByRole("button", { name: "Retirer de leur créneau (1)" })
  await bulk.tap()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Annuler" }).tap()
  await expect(dialog).toHaveCount(0)
  await expect(bulk).toBeFocused()
})
