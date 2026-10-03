import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The « Rapports » page of an event: what is printed for volunteers first, then what only the
 * organizers may see (the full export carries phones and emails), the badges, and the JSON archive
 * last.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function openReports(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  const res = await page.request.post("/api/admin/events", {
    data: { title: `E2E Rapports ${Date.now()}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const event: { id: string } = await res.json()
  await page.goto(`/admin/events/${event.id}/print`)
  await expect(page.getByRole("heading", { level: 1, name: "Rapports" })).toBeVisible()
}

test("sections in order: volunteers, organizers only (with the full export), badges, archive last", async ({ page }) => {
  await openReports(page)
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "À afficher ou à remettre aux bénévoles",
    "Pour les organisateurs seulement",
    "Badges",
    "Archive",
  ])

  const organizers = page.getByRole("region", { name: "Pour les organisateurs seulement" })
  const exportLink = organizers.getByRole("link", { name: /^Export complet/ })
  await expect(exportLink).toBeVisible()
  // The full export lists phones: it is described by the section's « ne pas afficher » note.
  await expect(exportLink).toHaveAccessibleDescription(/coordonnées.*numéros de téléphone/)
  await expect(page.getByRole("region", { name: "À afficher ou à remettre aux bénévoles" }).getByRole("link", { name: /Export complet/ })).toHaveCount(0)

  const archive = page.getByRole("region", { name: "Archive" }).getByRole("link", { name: /^Archive de l'événement \(JSON\)/ })
  await expect(archive).toBeVisible()
  await expect(archive).toHaveAttribute("download", "")

  expect(await seriousViolations(page)).toEqual([])
})
