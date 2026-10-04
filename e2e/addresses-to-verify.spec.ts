import { test, expect, type Page } from "@playwright/test"
import { createHmac, randomUUID } from "node:crypto"
import { Client } from "pg"
import { waitForHydration } from "./helpers/hydration"

/**
 * « Adresse à vérifier » (#599): a member whose current address was permanently rejected shows
 * the status on the members list, the filter finds them, and editing the address clears it.
 * #598's own DeliveryOutcome row is inserted directly in the DB (not through a real SMTP
 * failure, which this suite cannot trigger): the acceptance criterion is what the admin UI does
 * with that row, not how it got there. Raw `pg`, not the generated Prisma client: that client is
 * ESM-only (`import.meta`), which Playwright's own TypeScript loader cannot run.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/** Same normalization + keyed hash as src/lib/notifications/smtp-outcome.ts's addressHash. */
function addressHash(email: string, secret: string): string {
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex")
}

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

/** Inserts a permanent-rejection DeliveryOutcome row for `email`/`volunteerId` directly in the DB
 * (#598's own data, #599's acceptance criterion is what the admin UI does with it). */
async function insertRejectedOutcome(volunteerId: string, email: string) {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    const { rows } = await db.query<{ organizationId: string }>('SELECT "organizationId" FROM "Volunteer" WHERE id = $1', [volunteerId])
    const organizationId = rows[0].organizationId
    await db.query(
      `INSERT INTO "DeliveryOutcome" (id, "organizationId", "volunteerId", kind, outcome, reason, "responseCode", "enhancedStatus", "addressHash", "createdAt")
       VALUES ($1, $2, $3, 'registration_confirmation', 'rejected_permanent', 'mailbox_unknown', 550, '5.1.1', $4, now())`,
      [randomUUID(), organizationId, volunteerId, addressHash(email, process.env.AUTH_SECRET!)],
    )
  } finally {
    await db.end()
  }
}

test("a permanently rejected address shows « Adresse à vérifier », the filter finds it, editing the address clears it", async ({ page }) => {
  await login(page)

  const email = `e2e-verify-${Date.now()}@example.com`
  const lastName = `Verify${Date.now()}`
  const res = await page.request.post("/api/admin/members", { data: { firstName: "E2E", lastName, email } })
  expect(res.ok(), await res.text()).toBeTruthy()
  const member = await res.json()
  await insertRejectedOutcome(member.id, email)

  // Members list: the badge, and the filter.
  await page.goto("/admin/members")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const row = page.getByRole("row", { name: new RegExp(lastName) })
  await expect(row).toContainText("Adresse à vérifier")

  const filter = page.getByRole("checkbox", { name: /Adresses à vérifier/ })
  await waitForHydration(filter)
  await filter.check()
  await expect(page.getByRole("row", { name: new RegExp(lastName) })).toBeVisible()
  await expect(page.getByText("Aucun membre ne correspond aux filtres.")).toHaveCount(0)

  // Edit the address: the status disappears, and the save is announced once.
  await page.getByRole("button", { name: `Éditer E2E ${lastName}` }).click()
  const dialog = page.getByRole("dialog", { name: "Modifier le membre" })
  await expect(dialog).toBeVisible()
  const emailField = dialog.getByLabel("Email")
  await waitForHydration(emailField)
  const newEmail = `e2e-fixed-${Date.now()}@example.com`
  await emailField.fill(newEmail)
  await dialog.getByRole("button", { name: "Enregistrer" }).click()
  await expect(dialog).toHaveCount(0)

  await expect(page.getByText(/enregistrée/)).toBeVisible()
  await expect(page.getByText("Statut « Adresse à vérifier » levé.")).toBeVisible()
  await expect(page.getByRole("row", { name: new RegExp(lastName) })).toHaveCount(0) // filtered out, status gone
})

test("the member page's « Modifier l'adresse » link deep-links to the edit form, and cancelling it returns focus to the row (no opener was clicked)", async ({ page }) => {
  await login(page)

  const email = `e2e-verify-deep-${Date.now()}@example.com`
  const lastName = `VerifyDeep${Date.now()}`
  const res = await page.request.post("/api/admin/members", { data: { firstName: "E2E", lastName, email } })
  expect(res.ok(), await res.text()).toBeTruthy()
  const member = await res.json()
  await insertRejectedOutcome(member.id, email)

  await page.goto(`/admin/members/${member.id}`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const editLink = page.getByRole("link", { name: /Modifier l'adresse/ })
  await waitForHydration(editLink)
  await editLink.click()

  await expect(page).toHaveURL(new RegExp(`/admin/members\\?edit=${member.id}`))
  const dialog = page.getByRole("dialog", { name: "Modifier le membre" })
  await expect(dialog).toBeVisible()

  // Nothing was clicked on this page to open the dialog (it opened from the URL): cancelling must
  // still land focus somewhere sensible, not drop it back to <body>.
  await dialog.getByRole("button", { name: "Annuler" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("button", { name: `Éditer E2E ${lastName}` })).toBeFocused()
})
