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
