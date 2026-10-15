import { test, expect } from "@playwright/test"

/**
 * Hours with a role « Cumulable avec un autre créneau » (#986, part 2): a volunteer on « Buvette »
 * 10:00–14:00 and on the cumulable « Secours » 09:00–17:00 gave 8 h, not 12 h, in the members list,
 * the event summary and the hours-by-volunteer export.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

test("a volunteer's parallel time is counted once in their hours", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const stamp = Date.now()
  const day = daysAgo(5)
  const email = `e2e-parallel-${stamp}@example.com`
  const lastName = `Parallele${stamp}`
  await post("/api/admin/members", { firstName: "E2E", lastName, email })
  const event = await post("/api/admin/events", { title: `E2E heures cumul ${stamp}`, startDate: day, endDate: day, publicStatus: "draft" })
  const buvette = await post("/api/admin/shifts", { eventId: event.id, roleName: "Buvette", label: "Buvette", date: day, startTime: "10:00", endTime: "14:00", capacity: 2 })
  const secours = await post("/api/admin/shifts", { eventId: event.id, roleName: "Secours", label: "Secours", date: day, startTime: "09:00", endTime: "17:00", capacity: 1 })
  const cumul = await page.request.patch(`/api/admin/events/${event.id}/roles/Secours`, { data: { overlapAllowed: true } })
  expect(cumul.ok()).toBeTruthy()
  await post("/api/admin/registrations", { eventId: event.id, shiftId: buvette.id, firstName: "E2E", lastName, email })
  await post("/api/admin/registrations", { eventId: event.id, shiftId: secours.id, firstName: "E2E", lastName, email })

  // Rapports: one volunteer, two confirmed shifts, 8 h planned.
  await page.goto(`/admin/events/${event.id}/print`)
  const summary = page.getByRole("region", { name: "Résumé de l'événement" })
  await expect(summary).toContainText("0 sur 2 créneaux confirmés")
  await expect(summary).toContainText("8 h prévues")

  // Members list: 8h in « Heures prévues », not 12h.
  await page.goto("/admin/members")
  const row = page.getByRole("table", { name: "Liste des membres" }).getByRole("row", { name: new RegExp(lastName) })
  await expect(row).toContainText("8h")
  await expect(row).not.toContainText("12h")

  // Hours-by-volunteer export: 2 shifts, 8 planned hours.
  const csv = await (await page.request.get(`/api/admin/members/export-hours?from=${day}&to=${day}`)).text()
  const line = csv.split(/\r?\n/).find((l) => l.includes(lastName)) ?? ""
  expect(line.split(";").slice(2, 5)).toEqual(["1", "2", "8"])
})
