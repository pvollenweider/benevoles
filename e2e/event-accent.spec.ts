import { test, expect } from "@playwright/test"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

// Accent colour of an event's public page (#300, part 1).
test("the public header takes the organiser's colour and stays readable", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  const stamp = Date.now()
  const eventRes = await page.request.post("/api/admin/events", {
    data: { title: `E2E Accent ${stamp}`, startDate: "2031-06-01", endDate: "2031-06-01", accentColorKey: "blue" },
  })
  expect(eventRes.ok()).toBeTruthy()
  const event: { id: string; slug: string } = await eventRes.json()
  await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2031-06-01", startTime: "10:00", endTime: "12:00", capacity: 2 },
  })
  await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })

  // A free value is refused: only the palette.
  const refused = await page.request.patch(`/api/admin/events/${event.id}`, { data: { accentColorKey: "#ff0000" } })
  expect(refused.status()).toBe(400)

  await page.goto(`/${event.slug}?org=default`)
  const header = page.locator("header").first()
  await expect(header).toHaveClass(/bg-blue-700/)
  await expect(header.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(255, 255, 255)")
  const back = header.getByRole("link", { name: "Retour" })
  await back.focus()
  await expect(back).toHaveCSS("outline-color", "rgb(255, 255, 255)")
})
