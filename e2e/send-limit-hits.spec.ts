import { test, expect } from "@playwright/test"
import { Client } from "pg"
import { seriousViolations } from "./helpers/axe"
import { passSecondFactor } from "./helpers/super-admin"

/**
 * Sending limits reached (#1100): the super admin sees, above the organisations list, which
 * organisation hit which limit in the last 7 days, held apart from refused, and whether held
 * emails still wait; the row's marker leads to the organisation's block, whose heading takes the
 * focus. The hit is written directly in the DB (recording is covered by the unit and integration
 * tests). Raw `pg`: the generated Prisma client is ESM-only, which Playwright's loader cannot run.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

async function sql(query: string, params: unknown[]) {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    return (await db.query(query, params)).rows
  } finally {
    await db.end()
  }
}

test("the super admin sees a send limit reached, on the list and on the organisation's page", async ({ page }) => {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await passSecondFactor(page)
  await expect(page).toHaveURL(/\/admin\/dashboard|\/super-admin\/organizations/)

  const slug = `e2e-limit-${Date.now()}`
  const createRes = await page.request.post("/api/super-admin/organizations", {
    data: { name: slug, adminEmail: `${slug}-admin@example.com`, adminName: "E2E Admin" },
  })
  expect(createRes.ok()).toBeTruthy()
  const { org } = await createRes.json()
  const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
  await sql(
    `INSERT INTO "EmailLimitHit" (id, bucket, "organizationId", "limit", "hourStart", "heldCount", "refusedCount", "firstAt", "lastAt")
     VALUES ($1, $2, $3, 'org_per_minute', $4, 3, 2, now() - interval '2 minutes', now())`,
    [`e2e-${slug}`, `org_per_minute:${org.id}:${hour.toISOString().slice(0, 13)}`, org.id, hour],
  )

  try {
    await page.goto("/super-admin/organizations")
    const block = page.getByRole("region", { name: "Plafonds d'envoi atteints" })
    await expect(block).toBeVisible()
    const item = block.getByRole("listitem").filter({ has: page.getByRole("link", { name: `${slug} : plafonds d'envoi` }) })
    await expect(item).toContainText("Plus aucun email retenu en attente")
    await expect(item).toContainText("Plafond par minute de l'organisation")
    await expect(item).toContainText("3 emails retenus, 2 refusés")
    expect.soft(await seriousViolations(page), "organizations with limit hits").toEqual([])

    // The row's marker, named with its organisation, leads to the block of the organisation's page.
    await page.getByRole("link", { name: `Plafond d'envoi atteint par ${slug}` }).click()
    await expect(page).toHaveURL(new RegExp(`/super-admin/organizations/${org.slug}#plafonds-envoi$`))
    const heading = page.getByRole("heading", { level: 2, name: "Plafonds d'envoi atteints" })
    await expect(heading).toBeFocused()
    await expect(page.getByRole("region", { name: "Plafonds d'envoi atteints" })).toContainText("3 emails retenus, 2 refusés")
    expect.soft(await seriousViolations(page), "organisation page with limit hits").toEqual([])
  } finally {
    await sql(`DELETE FROM "EmailLimitHit" WHERE "organizationId" = $1`, [org.id])
  }
})
