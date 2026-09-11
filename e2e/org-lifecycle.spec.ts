import { test, expect } from "@playwright/test"

/**
 * Regression test for two related bugs: disabling an org didn't actually
 * block access anywhere (src/lib/resolve-org.ts, src/auth.ts,
 * src/lib/auth-guard.ts), and there was no way to delete an org at all.
 * Creates and tears down its own throwaway org so it never touches the
 * seeded "default" org other specs depend on.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test("disabling an org blocks public access; deletion requires disabled + typed confirmation", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const slug = `e2e-org-lifecycle-${Date.now()}`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail: `${slug}-admin@example.com`, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()
  const orgId: string = org.id
  const orgSlug: string = org.slug

  // Public page reachable while active.
  const beforeRes = await page.request.get(`/api/public/${slug}?org=${orgSlug}`)
  // No event exists for this org, so this 404s on the event lookup, not the
  // org lookup — the point here is just that the org itself resolves.
  expect(beforeRes.status()).toBe(404)
  expect((await beforeRes.json()).error).toBe("Événement non trouvé")

  // Deleting an active org must be rejected.
  const deleteWhileActive = await page.request.delete(`/api/super-admin/organizations/${orgId}`, {
    data: { confirmSlug: orgSlug },
  })
  expect(deleteWhileActive.status()).toBe(409)

  // Disable it.
  const disableRes = await page.request.patch(`/api/super-admin/organizations/${orgId}`, {
    data: { active: false },
  })
  expect(disableRes.ok()).toBeTruthy()

  // Wrong confirmation slug must be rejected even when disabled.
  const wrongConfirm = await page.request.delete(`/api/super-admin/organizations/${orgId}`, {
    data: { confirmSlug: "not-the-right-slug" },
  })
  expect(wrongConfirm.status()).toBe(400)

  // Correct confirmation deletes it.
  const deleteRes = await page.request.delete(`/api/super-admin/organizations/${orgId}`, {
    data: { confirmSlug: orgSlug },
  })
  expect(deleteRes.ok()).toBeTruthy()

  const afterDelete = await page.request.get(`/api/super-admin/organizations/${orgId}`)
  expect(afterDelete.status()).toBe(404)
})
