import { test, expect, type Page } from "@playwright/test"

/**
 * Super admin statistics (#805): the « Depuis le début » counters are kept by database triggers and
 * never go down, even when a whole organisation is deleted. Other specs create organisations in
 * parallel, so counts are compared with « at least », never with an exact value.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

async function cumulative(page: Page, label: string): Promise<number> {
  await page.goto("/super-admin/stats")
  const table = page.getByRole("table", { name: "Depuis le début" })
  const cell = table.getByRole("row", { name: new RegExp(`^${label}`) }).getByRole("cell")
  return Number((await cell.innerText()).replace(/\s/g, ""))
}

test("cumulative counters count a new organisation and keep it after its deletion", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

  const orgsBefore = await cumulative(page, "Organisations créées")
  const adminsBefore = await cumulative(page, "Comptes administrateurs créés")

  const slug = `e2e-usage-counters-${Date.now()}`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail: `${slug}-admin@example.com`, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()

  const orgsAfterCreate = await cumulative(page, "Organisations créées")
  expect(orgsAfterCreate).toBeGreaterThanOrEqual(orgsBefore + 1)
  expect(await cumulative(page, "Comptes administrateurs créés")).toBeGreaterThanOrEqual(adminsBefore + 1)

  // The organisation's own counters: its first admin account is counted.
  await page.goto(`/super-admin/organizations/${org.slug}`)
  const own = page.getByRole("region", { name: "Depuis le début" })
  await expect(own.getByText("Comptes administrateurs créés")).toBeVisible()
  await expect(own.getByRole("definition").filter({ hasText: /^1$/ }).first()).toBeVisible()

  expect((await page.request.patch(`/api/super-admin/organizations/${org.id}`, { data: { active: false } })).ok()).toBeTruthy()
  expect((await page.request.delete(`/api/super-admin/organizations/${org.id}`, { data: { confirmSlug: org.slug } })).ok()).toBeTruthy()

  expect(await cumulative(page, "Organisations créées")).toBeGreaterThanOrEqual(orgsAfterCreate)
})
