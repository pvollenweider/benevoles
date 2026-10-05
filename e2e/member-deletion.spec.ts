import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * Permanent member deletion (#667): deactivate a member with no registration, then delete it —
 * it disappears from the list for good (not just filtered out by « Inclure inactifs »).
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

test("deactivate a member without registration, delete it, it is gone from the list", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }

  const suffix = Date.now()
  const lastName = `DeleteE2E${suffix}`
  const member = await post("/api/admin/members", { firstName: "Léa", lastName, email: `lea-delete-${suffix}@example.com` })

  await page.goto("/admin/members")
  const nameRe = new RegExp(`${member.firstName}.*${lastName}`)

  // Not eligible yet: still active, so no « Supprimer » row action.
  const row = page.getByRole("row", { name: nameRe })
  await expect(row).toBeVisible()
  await expect(row.getByRole("button", { name: /^Supprimer/ })).toHaveCount(0)

  // Deactivate first.
  const deactivateButton = row.getByRole("button", { name: /^Désactiver/ })
  await waitForHydration(deactivateButton)
  await deactivateButton.click()
  await page.getByRole("button", { name: "Désactiver", exact: true }).click()
  await expect(page.getByText(`${member.firstName} ${member.lastName} désactivé·e.`)).toBeVisible()

  // Inactive members are filtered out by default: check the box to find the row again.
  await page.getByRole("checkbox", { name: "Inclure inactifs" }).check()
  const inactiveRow = page.getByRole("row", { name: nameRe })
  await expect(inactiveRow).toBeVisible()

  // Now eligible: no registration, inactive.
  const deleteButton = inactiveRow.getByRole("button", { name: /^Supprimer/ })
  await waitForHydration(deleteButton)
  await deleteButton.click()
  const dialog = page.getByRole("alertdialog", { name: new RegExp(`Supprimer ${member.firstName} ${member.lastName}`) })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("irréversible")
  await dialog.getByRole("button", { name: "Supprimer", exact: true }).click()

  await expect(page.getByText(`${member.firstName} ${member.lastName} supprimé·e.`)).toBeVisible()
  // Gone for good, even with « Inclure inactifs » checked.
  await expect(page.getByRole("row", { name: nameRe })).toHaveCount(0)
})
