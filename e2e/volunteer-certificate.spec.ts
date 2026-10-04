import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * The volunteer certificate (#556): from a member's activity page, « Attestation de bénévolat »
 * opens a page with the form (period, free text, planned-hours checkbox) and the printable
 * document itself — headings and a table with its per-event lines, the checkbox toggling the
 * planned-hours column live, with no page reload.
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

// A date well inside the default 12-month period, whatever day the suite runs.
function recentDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

test("open a member page, open the certificate, see the headings and the table, toggle the planned-hours checkbox", async ({ page }) => {
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const email = `e2e-cert-${Date.now()}@example.com`
  const member = await post("/api/admin/members", { firstName: "E2E", lastName: "Certificate", email })
  const date = recentDate()
  const event = await post("/api/admin/events", { title: `E2E certificat ${Date.now()}`, startDate: date, endDate: date, publicStatus: "draft" })
  const shift = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date, startTime: "18:00", endTime: "20:00", capacity: 5 })
  const registration = await post("/api/admin/registrations", { eventId: event.id, shiftId: shift.id, firstName: "E2E", lastName: "Certificate", email })
  await post(`/api/admin/events/${event.id}/registrations/bulk`, { action: "check_in", registrationIds: [registration.id] })

  await page.goto(`/admin/members/${member.id}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.getByRole("link", { name: "Attestation de bénévolat" }).click()
  await expect(page).toHaveURL(/\/certificate$/)

  await expect(page.getByRole("heading", { level: 1, name: "Attestation de bénévolat" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Réglages de l'attestation" })).toBeVisible()

  const table = page.getByRole("table")
  await expect(table).toBeVisible()
  await expect(table.getByText(event.title)).toBeVisible()
  await expect(table.getByRole("columnheader", { name: "Heures attestées" })).toBeVisible()
  await expect(table.getByRole("columnheader", { name: /planifiées/ })).toHaveCount(0)

  const checkbox = page.getByRole("checkbox", { name: /Inclure les heures planifiées/ })
  // The checkbox is a controlled input (checked={includePlanned}): before hydration, a click
  // reaches the DOM node but React hasn't attached its handler yet, so the state never flips.
  await waitForHydration(checkbox)
  await expect(checkbox).not.toBeChecked()
  await checkbox.check()
  await expect(checkbox).toBeChecked()
  await expect(table.getByRole("columnheader", { name: /planifiées/ })).toBeVisible()
})
