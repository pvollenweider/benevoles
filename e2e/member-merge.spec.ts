import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * Member merge (#600): two members with the same name, one with registrations. Open the merge
 * flow from the member page, preview shows the registration that will move, confirm, the kept
 * member shows the registration and the absorbed one is gone from the list.
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

test("merge two same-name members: the preview shows the move, the kept member ends up with the registration", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }

  const suffix = Date.now()
  const lastName = `MergeE2E${suffix}`
  const keep = await post("/api/admin/members", { firstName: "Jean", lastName, email: `jean-keep-${suffix}@example.com` })
  const absorb = await post("/api/admin/members", { firstName: "Jean", lastName, email: `jean-wrong-${suffix}@example.com` })

  const date = new Date()
  date.setDate(date.getDate() + 30)
  const isoDate = date.toISOString().slice(0, 10)
  const event = await post("/api/admin/events", { title: `E2E fusion ${suffix}`, startDate: isoDate, endDate: isoDate, publicStatus: "draft" })
  const shift = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: isoDate, startTime: "18:00", endTime: "20:00", capacity: 5 })
  await post("/api/admin/registrations", { eventId: event.id, shiftId: shift.id, firstName: "Jean", lastName, email: absorb.email })

  await page.goto(`/admin/members/${keep.id}/merge`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

  const searchBox = page.getByLabel("Rechercher un membre par nom ou email")
  await waitForHydration(searchBox)
  await searchBox.fill(lastName)
  await page.getByRole("button", { name: "Chercher", exact: true }).click()
  await page.getByRole("button", { name: new RegExp(`Fusionner avec cette fiche.*Jean ${lastName}`) }).click()

  await expect(page.getByRole("heading", { name: `Aperçu de la fusion avec Jean ${lastName}` })).toBeVisible()
  const table = page.getByRole("table", { name: "Nombre de lignes concernées par la fusion, par type" })
  await expect(table.getByText("Inscriptions confirmée")).toBeVisible()

  const confirmButton = page.getByRole("button", { name: "Fusionner les deux fiches" })
  await waitForHydration(confirmButton)
  await confirmButton.click()
  await page.getByRole("button", { name: "Confirmer la fusion" }).click()

  await expect(page.getByRole("heading", { name: "Fusion effectuée" })).toBeVisible()
  await expect(page.getByText(/1 inscription déplacée/)).toBeVisible()

  await page.goto(`/admin/members/${keep.id}`)
  await expect(page.getByText(event.title)).toBeVisible()

  // The absorbed record is gone from the (active-only, default) members list: only the kept
  // member's row still shows this name.
  await page.goto("/admin/members")
  await expect(page.getByRole("row", { name: new RegExp(`Jean ${lastName}`) })).toHaveCount(1)
})
