import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * A documentation unit (#649): guide/<slug>.md rendered at /doc/<slug>, with its breadcrumb, its
 * single <h1>, who it is for and the link from the old guide. The parsing and the checks of the
 * units are unit-tested in src/lib/__tests__/doc-units.test.ts.
 */
const UNIT = "/doc/revenir-sur-la-page-d-inscription"

test("a unit page has a breadcrumb, one title, its audience and no serious violation", async ({ page }) => {
  const response = await page.goto(UNIT)
  expect(response?.status()).toBe(200)

  const breadcrumb = page.getByRole("navigation", { name: "Fil d'Ariane" })
  await expect(breadcrumb.getByRole("link", { name: "Documentation" })).toHaveAttribute("href", "/doc")
  await expect(breadcrumb).toContainText("Après l'inscription")
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText("Revenir sur la page d'inscription")

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revenir sur la page d'inscription")
  // The audience is plain text; the link is named after its target, the guide.
  const audience = page.locator("main p", { hasText: /^Pour\s:/ })
  await expect(audience).toHaveText(/^Pour\s:\sbénévoles \(Guide bénévole\)$/)
  await expect(audience.getByRole("link", { name: "Guide bénévole", exact: true })).toHaveAttribute("href", "/doc/benevole")
  await expect(page.getByRole("link", { name: "bénévoles", exact: true })).toHaveCount(0)
  await expect(page.getByText("Quitter la session")).toBeVisible()

  await expect(page).toHaveTitle("Revenir sur la page d'inscription — benevol.app")
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/doc\/revenir-sur-la-page-d-inscription$/)

  expect.soft(await seriousViolations(page)).toEqual([])
})

test("the volunteer guide links to the unit, by its site path", async ({ page }) => {
  await page.goto("/doc/benevole")
  const link = page.locator("#revenir-sur-la-page-d-inscription + p").getByRole("link", { name: "Revenir sur la page d'inscription" })
  await expect(link).toHaveAttribute("href", UNIT)
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${UNIT}$`))
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revenir sur la page d'inscription")
})

test("an unknown unit is a 404, and a static page of /doc still wins over the units", async ({ page }) => {
  expect((await page.goto("/doc/cette-page-n-existe-pas"))?.status()).toBe(404)
  await page.goto("/doc/admin")
  await expect(page.getByRole("navigation", { name: "Fil d'Ariane" })).toHaveCount(0)
})
