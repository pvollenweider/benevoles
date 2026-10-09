import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * Suspension of an organisation for abuse (#810): distinct from a deactivation, never undone by
 * « Réactiver », lifted only explicitly, and the organisation stays deactivated after that.
 * Creates and deletes its own throwaway organisation.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test("suspend for abuse, refuse a plain reactivation, lift, then reactivate", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

  const slug = `e2e-suspension-${Date.now()}`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail: `${slug}-admin@example.com`, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()
  const url = `/api/super-admin/organizations/${org.id}`

  // A reason is required.
  expect((await page.request.patch(url, { data: { suspended: true } })).status()).toBe(400)

  const suspend = await page.request.patch(url, { data: { suspended: true, suspensionReason: "Envoi de spam (test E2E)" } })
  expect(suspend.ok()).toBeTruthy()
  const suspended = await suspend.json()
  expect(suspended.active).toBe(false)
  expect(suspended.suspendedAt).toBeTruthy()

  // « Réactiver » is refused while suspended.
  const reactivate = await page.request.patch(url, { data: { active: true } })
  expect(reactivate.status()).toBe(409)
  expect((await reactivate.json()).error).toBe("Organisation suspendue : levez d'abord la suspension.")

  // The detail page shows the state, the reason and « Lever la suspension », without serious a11y violation.
  await page.goto(`/super-admin/organizations/${org.slug}`)
  await expect(page.getByText("Suspendue", { exact: true })).toBeVisible()
  await expect(page.getByText("Raison de la suspension : Envoi de spam (test E2E)")).toBeVisible()
  await expect(page.getByRole("button", { name: "Lever la suspension" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Réactiver" })).toHaveCount(0)
  expect.soft(await seriousViolations(page), "suspended organisation").toEqual([])

  // Lifting leaves it deactivated; then a plain reactivation works.
  const lift = await page.request.patch(url, { data: { suspended: false } })
  expect(lift.ok()).toBeTruthy()
  const lifted = await lift.json()
  expect(lifted.suspendedAt).toBeNull()
  expect(lifted.active).toBe(false)
  expect((await page.request.patch(url, { data: { active: true } })).ok()).toBeTruthy()

  // Clean up: deactivate, then delete.
  expect((await page.request.patch(url, { data: { active: false } })).ok()).toBeTruthy()
  expect((await page.request.delete(url, { data: { confirmSlug: org.slug } })).ok()).toBeTruthy()
})
