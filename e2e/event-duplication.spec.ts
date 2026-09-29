import { test, expect } from "@playwright/test"

/**
 * Duplicating an event must not resurrect shifts already deleted (soft-cancelled) from the
 * source event — regression test for #216, where the duplicate route copied every shift
 * regardless of status and force-set "open" on all of them.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("duplicating an event does not bring back a shift already deleted from the source", async ({ page }) => {
  const stamp = Date.now()

  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const eventRes = await page.request.post("/api/admin/events", {
    data: { title: `E2E Duplicate ${stamp}`, startDate: "2030-08-01", endDate: "2030-08-01", publicStatus: "draft" },
  })
  expect(eventRes.ok()).toBeTruthy()
  const source: { id: string } = await eventRes.json()

  const keptRes = await page.request.post("/api/admin/shifts", {
    data: { eventId: source.id, roleName: "Accueil", label: "Accueil", date: "2030-08-01", startTime: "10:00", endTime: "12:00", capacity: 2 },
  })
  expect(keptRes.ok()).toBeTruthy()

  const deletedRes = await page.request.post("/api/admin/shifts", {
    data: { eventId: source.id, roleName: "Bar", label: "Bar", date: "2030-08-01", startTime: "14:00", endTime: "16:00", capacity: 2 },
  })
  expect(deletedRes.ok()).toBeTruthy()
  const deletedShift: { id: string } = await deletedRes.json()

  // Soft-delete it — DELETE just sets status: "cancelled", it's never actually removed.
  const cancelRes = await page.request.delete(`/api/admin/shifts/${deletedShift.id}`)
  expect(cancelRes.ok()).toBeTruthy()

  const dupRes = await page.request.post(`/api/admin/events/${source.id}/duplicate`)
  expect(dupRes.ok()).toBeTruthy()
  const duplicate: { id: string } = await dupRes.json()

  const dupDetailRes = await page.request.get(`/api/admin/events/${duplicate.id}`)
  expect(dupDetailRes.ok()).toBeTruthy()
  const dupEvent: { shifts: { roleName: string; status: string }[] } = await dupDetailRes.json()
  const dupShifts = dupEvent.shifts

  expect(dupShifts).toHaveLength(1)
  expect(dupShifts[0].roleName).toBe("Accueil")
  expect(dupShifts.some((s) => s.roleName === "Bar")).toBe(false)
})

test("duplication with choices moves the dates and honours the checkboxes (#378)", async ({ page }) => {
  const stamp = Date.now()
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const created = await page.request.post("/api/admin/events", { data: { title: `E2E Choices ${stamp}`, startDate: "2030-08-01", endDate: "2030-08-02" } })
  expect(created.ok()).toBeTruthy()
  const source: { id: string } = await created.json()
  const shift = await page.request.post("/api/admin/shifts", {
    data: { eventId: source.id, roleName: "Bar", label: "Bar", date: "2030-08-02", startTime: "10:00", endTime: "12:00", capacity: 2 },
  })
  expect(shift.ok()).toBeTruthy()

  // The form: new title, first day one week later, shifts kept.
  await page.goto(`/admin/events/${source.id}/duplicate`)
  await page.getByLabel("Titre de la copie").fill(`E2E Choices ${stamp} 2031`)
  await page.getByLabel("Premier jour de la copie").fill("2030-08-08")
  await expect(page.getByRole("region", { name: "Ce que vous allez créer" })).toContainText("+7 jours")
  await page.getByRole("button", { name: "Créer la copie" }).click()
  await expect(page).toHaveURL(/\/admin\/events\/(?!.*duplicate)[^/]+$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E Choices ${stamp} 2031`)

  const copyId = page.url().split("/").pop()!
  const detail: { startDate: string; endDate: string; shifts: { date: string }[] } = await (await page.request.get(`/api/admin/events/${copyId}`)).json()
  expect(detail.startDate.slice(0, 10)).toBe("2030-08-08")
  expect(detail.endDate.slice(0, 10)).toBe("2030-08-09")
  expect(detail.shifts.map((s) => s.date.slice(0, 10))).toEqual(["2030-08-09"])

  // API with shifts unchecked: an empty copy.
  const bare = await page.request.post(`/api/admin/events/${source.id}/duplicate`, { data: { copy: { shifts: false } } })
  expect(bare.ok()).toBeTruthy()
  const bareEvent: { id: string } = await bare.json()
  const bareDetail: { shifts: unknown[] } = await (await page.request.get(`/api/admin/events/${bareEvent.id}`)).json()
  expect(bareDetail.shifts).toHaveLength(0)
})
