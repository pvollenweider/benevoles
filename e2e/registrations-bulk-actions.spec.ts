import { test, expect } from "@playwright/test"

/**
 * Bulk actions on the registrations list (#220): select several rows and cancel or "rendre
 * responsable" them all at once, instead of one row at a time.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function setUpEventWithRegistrations(page: import("@playwright/test").Page, stamp: number, count: number) {
  const eventRes = await page.request.post("/api/admin/events", {
    data: { title: `E2E Bulk Actions ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })
  const event: { id: string } = await eventRes.json()

  const shiftRes = await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "18:00", capacity: count },
  })
  const shift: { id: string } = await shiftRes.json()

  const regIds: string[] = []
  for (let i = 0; i < count; i++) {
    const res = await page.request.post("/api/admin/registrations", {
      data: {
        eventId: event.id, shiftId: shift.id,
        firstName: "E2E", lastName: `Bulk${i}`, email: `e2e-bulk-${stamp}-${i}@example.com`,
      },
    })
    const reg = await res.json()
    regIds.push(reg.id)
  }

  return { eventId: event.id, shiftId: shift.id, regIds }
}

test("selecting all visible rows and bulk-cancelling removes them all", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 3)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await expect(page.getByText("3 inscription(s) active(s)")).toBeVisible()

  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()
  await expect(page.getByText("3 sélectionnées")).toBeVisible()

  page.once("dialog", (d) => d.accept())
  await page.getByRole("button", { name: /^Annuler \(3\)$/ }).click()

  await expect(page.getByText("Aucune inscription.")).toBeVisible()

  const detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  expect(detail.shifts[0].registrations).toHaveLength(0)
})

test("selecting a subset only cancels those rows", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 3)

  await page.goto(`/admin/events/${eventId}/registrations`)
  const rows = page.locator("tbody tr")
  await expect(rows).toHaveCount(3)

  await rows.nth(0).getByRole("checkbox").check()
  await rows.nth(1).getByRole("checkbox").check()
  await expect(page.getByText("2 sélectionnées")).toBeVisible()

  page.once("dialog", (d) => d.accept())
  await page.getByRole("button", { name: /^Annuler \(2\)$/ }).click()

  await expect(rows).toHaveCount(1)
})

test("bulk 'rendre responsable' makes every selected volunteer a leader of their own shift's role", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()

  page.once("dialog", (d) => d.accept())
  await page.getByRole("button", { name: "Rendre responsable" }).click()

  // The confirmation is an sr-only aria-live announcement (never visually shown), so
  // toBeAttached() rather than toBeVisible(). Each item sends a real email (sector-leader
  // invite) — this can be slow in a misconfigured local SMTP setup (see #228) but should be
  // fast in CI, which runs the pinned Node version.
  await expect(page.getByText(/\d+ responsables? ajoutés?\./)).toBeAttached({ timeout: 20_000 })

  const leaders = await (await page.request.get(`/api/admin/events/${eventId}/sector-leaders`)).json()
  expect(leaders).toHaveLength(2)
  expect(leaders.every((l: { roleName: string }) => l.roleName === "Bar")).toBe(true)
})

test("deselecting clears the selection and hides the toolbar", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEventWithRegistrations(page, stamp, 2)

  await page.goto(`/admin/events/${eventId}/registrations`)
  await page.getByLabel("Sélectionner toutes les inscriptions visibles").check()
  await expect(page.getByText("2 sélectionnées")).toBeVisible()

  await page.getByRole("button", { name: "Désélectionner" }).click()
  await expect(page.getByText("2 sélectionnées")).not.toBeVisible()
})
