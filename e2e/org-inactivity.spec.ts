import { test, expect } from "@playwright/test"

/**
 * The operator's hand on the periodic check of inactive organisations (#811), on the
 * organisation's page: postpone, cancel (focus goes back to « Reporter »), exclude for good and
 * put back. The new organisation is deleted at the end.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test("postpone, cancel, exclude and restore the inactivity check of an organisation", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

  const slug = `e2e-inactivity-${Date.now()}`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail: `${slug}-admin@example.com`, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()

  await page.goto(`/super-admin/organizations/${org.slug}`)
  const panel = page.getByRole("region", { name: "Vérification d'inactivité" })
  await expect(panel.getByText(/Premier email « Souhaitez-vous conserver votre espace \? » prévu le/)).toBeVisible()

  await panel.getByLabel("Durée du report, à partir d'aujourd'hui").selectOption("12")
  await panel.getByRole("button", { name: "Reporter", exact: true }).click()
  await expect(panel.getByRole("status")).toHaveText("Vérification reportée de 12 mois.")
  await expect(panel.getByText(/Reporté jusqu'au/)).toBeVisible()

  await panel.getByRole("button", { name: "Annuler le report" }).click()
  await expect(panel.getByRole("status")).toHaveText("Report annulé.")
  await expect(panel.getByRole("button", { name: "Annuler le report" })).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Reporter", exact: true })).toBeFocused()

  await panel.getByRole("button", { name: "Ne jamais désactiver automatiquement" }).click()
  await expect(panel.getByText("Elle ne sera jamais désactivée automatiquement.")).toBeVisible()
  const restore = panel.getByRole("button", { name: "Rétablir la vérification automatique" })
  await expect(restore).toBeFocused()

  await page.goto("/super-admin/inactivity")
  await expect(page.getByRole("region", { name: "Jamais désactivées automatiquement" }).getByRole("link", { name: slug })).toBeVisible()

  await page.goto(`/super-admin/organizations/${org.slug}`)
  await page.getByRole("button", { name: "Rétablir la vérification automatique" }).click()
  await expect(panel.getByRole("button", { name: "Ne jamais désactiver automatiquement" })).toBeVisible()

  expect((await page.request.patch(`/api/super-admin/organizations/${org.id}`, { data: { active: false } })).ok()).toBeTruthy()
  expect((await page.request.delete(`/api/super-admin/organizations/${org.id}`, { data: { confirmSlug: org.slug } })).ok()).toBeTruthy()
})
