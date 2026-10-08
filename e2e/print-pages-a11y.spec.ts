import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The printable documents of an event (« Rapports »): the sheets, the complete export and the
 * badges are HTML pages printed from the browser. They are the accessible version of what gets
 * printed: a PDF saved from the browser is only tagged for screen readers if the browser does it
 * (ACCESSIBILITE.md, « Limites connues »). axe-core on each, on the seeded event.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

const SHEETS = ["day", "role", "individual", "attendance", "phones", "answers"]

test("printable sheets, complete export and badges have no serious violation", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  await page.goto("/admin/events")
  await page.getByRole("link", { name: /Spectacle/ }).first().click()
  await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
  const base = `${new URL(page.url()).pathname.replace("/admin/events/", "/api/admin/events/")}/export`

  for (const path of [...SHEETS.map((s) => `sheets/${s}`), "pdf", "badges"]) {
    const res = await page.goto(`${base}/${path}`)
    expect(res?.status(), path).toBe(200)
    await expect(page, path).toHaveTitle(/\S/)
    expect.soft(await seriousViolations(page), path).toEqual([])
  }
})
