import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The shift picker of the registrations page with the keyboard alone (#555): a select-only
 * combobox in the manual add form and in the shift filter, checked by axe with its list open.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

/** An event with a « Bar » shift in the morning and an « Accueil » one in the afternoon, one person on Accueil. */
async function setUpEvent(page: Page, stamp: number) {
  const event: { id: string } = await (await page.request.post("/api/admin/events", {
    data: { title: `E2E Shift Select ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })).json()
  const bar: { id: string } = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 3 },
  })).json()
  const accueil: { id: string } = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 3 },
  })).json()
  await page.request.post("/api/admin/registrations", {
    data: { eventId: event.id, shiftId: accueil.id, firstName: "E2E", lastName: "Accueil", email: `e2e-shift-select-${stamp}@example.com` },
  })
  return { eventId: event.id, barId: bar.id }
}

test("a shift is chosen with the keyboard in the manual add form", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId, barId } = await setUpEvent(page, stamp)
  await page.goto(`/admin/events/${eventId}/registrations`)

  const open = page.getByRole("button", { name: "+ Ajouter manuellement" })
  await open.click()
  await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await page.getByLabel("Nom *", { exact: true }).fill(`Clavier${stamp}`)

  const combo = page.getByRole("combobox", { name: "Créneau *" })
  await combo.focus()
  await page.keyboard.press("ArrowDown")
  await expect(combo).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("listbox", { name: "Créneau *" })).toBeVisible()
  // axe with the list open: the listbox, its options and the active descendant.
  expect.soft(await seriousViolations(page)).toEqual([])

  await page.keyboard.press("Enter")
  await expect(combo).toHaveAttribute("aria-expanded", "false")
  await expect(combo).toContainText("Bar")
  await expect(combo).toBeFocused()

  await page.getByRole("button", { name: "Ajouter", exact: true }).click()
  await expect(open).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: `E2E Clavier${stamp} ajouté·e au créneau Bar` })).toBeVisible()

  const detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  const shift = detail.shifts.find((s: { id: string }) => s.id === barId)
  expect(shift.registrations).toHaveLength(1)
})

test("the shift filter is named and works with the keyboard", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEvent(page, stamp)
  await page.goto(`/admin/events/${eventId}/registrations`)
  await expect(page.getByRole("status").filter({ hasText: "1 inscription affichée" })).toBeAttached()

  const filter = page.getByRole("combobox", { name: "Filtrer par créneau" })
  await filter.focus()
  await page.keyboard.press("b")
  await expect(page.getByRole("listbox", { name: "Filtrer par créneau" })).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])
  await page.keyboard.press("Enter")

  await expect(filter).toContainText("Bar")
  await expect(page.getByText("Aucun résultat.")).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: "0 inscription affichée" })).toBeAttached()

  await page.keyboard.press("Home")
  await page.keyboard.press("Enter")
  await expect(filter).toContainText("Tous les créneaux")
  await expect(page.getByRole("status").filter({ hasText: "1 inscription affichée" })).toBeAttached()
})
