import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"

/**
 * A documentation unit (#649): guide/<slug>.md rendered at /doc/<slug>, with its breadcrumb, its
 * single <h1> and who it is for; a unit shared by both roles; the indexes of the units on /doc and
 * on the guides' pages; the old anchors of the guides followed to their unit. The parsing and the
 * checks of the units are unit-tested in src/lib/__tests__/doc-units.test.ts, the frozen anchors in
 * src/lib/__tests__/legacy-doc-anchors.test.ts.
 */
const UNIT = "/doc/revenir-sur-la-page-d-inscription"
const ANCHOR = "revenir-sur-la-page-d-inscription"

test("a unit page has a breadcrumb, one title, its audience and no serious violation", async ({ page }) => {
  const response = await page.goto(UNIT)
  expect(response?.status()).toBe(200)

  const breadcrumb = page.getByRole("navigation", { name: "Fil d'Ariane" })
  await expect(breadcrumb.getByRole("link", { name: "Documentation" })).toHaveAttribute("href", "/doc")
  await expect(breadcrumb.getByRole("link", { name: "Après l'inscription" })).toHaveAttribute("href", "/doc#apres-inscription")
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

test("a unit for both roles says so, then speaks to each under its own heading", async ({ page }) => {
  await page.goto("/doc/liste-d-attente")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Liste d'attente")
  await expect(page.locator("main p", { hasText: /^Pour\s:/ })).toHaveText(/^Pour\s:\sorganisateurs \(Guide administrateur\), bénévoles \(Guide bénévole\)$/)
  await expect(page.getByRole("heading", { level: 2, name: "Côté organisation" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: "Côté bénévole" })).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])
})

test("the volunteer guide's page lists its units, each linked by its site path", async ({ page }) => {
  await page.goto("/doc/benevole")
  const link = page.locator("main li").getByRole("link", { name: "Revenir sur la page d'inscription", exact: true })
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

test("the breadcrumb's group leads to that group on the documentation's index", async ({ page }) => {
  await page.goto(UNIT)
  await page.getByRole("navigation", { name: "Fil d'Ariane" }).getByRole("link", { name: "Après l'inscription" }).click()
  await expect(page).toHaveURL(/\/doc#apres-inscription$/)
  await expect(page.getByRole("heading", { level: 3, name: "Après l'inscription" })).toBeInViewport()
})

test("/doc lists every unit by group, linked by its title, with its summary and who it is for", async ({ page }) => {
  await page.goto("/doc")
  await expect(page.getByRole("heading", { level: 2, name: "Pages par thème" })).toBeVisible()
  const group = page.getByRole("heading", { level: 3, name: "Après l'inscription" })
  await expect(group).toHaveAttribute("id", "apres-inscription")
  const item = page.locator("#apres-inscription + ul > li", { hasText: "Revenir sur la page d'inscription" })
  await expect(item.getByRole("link", { name: "Revenir sur la page d'inscription", exact: true })).toHaveAttribute("href", UNIT)
  await expect(item).toContainText("Pour\u00a0: bénévoles.")
  // The guides' list keeps its links, without an em dash.
  await expect(page.getByRole("link", { name: "Guide bénévole" }).first()).toBeVisible()
  await expect(page.locator("main")).not.toContainText("—")
})

test("a link of the index shows the same focus outline as the links a page draws itself", async ({ page }) => {
  await page.goto("/doc")
  const link = page.getByRole("link", { name: "Revenir sur la page d'inscription", exact: true })
  await link.focus()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Tab")
  await expect(link).toBeFocused()
  await expect(link).toHaveCSS("outline-style", "solid")
  await expect(link).toHaveCSS("outline-width", "2px")
  await expect(link).toHaveCSS("outline-offset", "2px")
})

test("the volunteer guide is the index of its units alone; the admin guide lists its units above the whole guide", async ({ page }) => {
  await page.goto("/doc/benevole")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guide bénévole")
  const headings = page.getByRole("heading", { level: 2 })
  await expect(headings).toHaveCount(1)
  await expect(headings.nth(0)).toHaveText("Pages par thème")
  await expect(page.getByRole("heading", { name: "Le guide complet" })).toHaveCount(0)
  for (const group of ["S'inscrire à un créneau", "Après l'inscription", "Règles d'inscription"]) {
    await expect(page.getByRole("heading", { level: 3, name: group })).toBeVisible()
  }
  await expect(page.locator("main li").getByRole("link", { name: "S'inscrire", exact: true })).toHaveAttribute("href", "/doc/s-inscrire")

  await page.goto("/doc/admin")
  const adminHeadings = page.getByRole("heading", { level: 2 })
  await expect(adminHeadings.nth(0)).toHaveText("Pages par thème")
  await expect(adminHeadings.nth(1)).toHaveText("Le guide complet")
  await expect(adminHeadings).toHaveCount(2)
  // The guide's sections sit under « Le guide complet », one level down, with their usual ids.
  await expect(page.getByRole("heading", { level: 3, name: "Premiers pas" })).toHaveAttribute("id", "premiers-pas")
  // A link name always leads to one place on the page (the guide also links to the shared units).
  const links = await page.locator("main a").evaluateAll((as) => as.map((a) => [a.textContent?.trim(), a.getAttribute("href")]))
  const hrefByName = new Map<string, Set<string>>()
  for (const [name, href] of links) hrefByName.set(name ?? "", (hrefByName.get(name ?? "") ?? new Set<string>()).add(href ?? ""))
  for (const [name, hrefs] of hrefByName) expect(hrefs.size, name).toBe(1)
  await expect(page.locator("main a", { hasText: "Rappels et changements de créneau" }).first()).toHaveAttribute("href", "/doc/rappels")
})

test.describe("old anchors of the guides", () => {
  test("an anchor still in the guide stays on the guide", async ({ page }) => {
    await page.goto("/doc/admin#premiers-pas")
    await waitForHydration(page.getByRole("button", { name: "Thème sombre" }))
    await expect(page.getByRole("heading", { level: 3, name: "Premiers pas" })).toBeInViewport()
    await expect(page).toHaveURL(/\/doc\/admin#premiers-pas$/)
  })

  test("an unknown anchor stays on the guide", async ({ page }) => {
    await page.goto("/doc/benevole#cette-ancre-n-existe-pas")
    await waitForHydration(page.getByRole("button", { name: "Thème sombre" }))
    await expect(page).toHaveURL(/\/doc\/benevole#cette-ancre-n-existe-pas$/)
  })

  test("an anchor gone from the guide opens its unit, without a history entry for the dead anchor", async ({ page }) => {
    await page.goto("/doc")
    await page.goto(`/doc/benevole#${ANCHOR}`)
    await expect(page).toHaveURL(new RegExp(`${UNIT}$`))
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revenir sur la page d'inscription")
    await page.goBack()
    await expect(page).toHaveURL(/\/doc$/)
  })

  test("a moved section keeps its fragment when its unit has the same heading", async ({ page }) => {
    await page.goto("/doc/admin#rappels-automatiques")
    await expect(page).toHaveURL(/\/doc\/rappels#rappels-automatiques$/)
    await expect(page.getByRole("heading", { level: 2, name: "Rappels automatiques" })).toBeInViewport()
    await page.goto("/doc/benevole#confirmation")
    await expect(page).toHaveURL(/\/doc\/s-inscrire#confirmation$/)
  })

  test("the same, when the fragment changes on the guide's page", async ({ page }) => {
    await page.goto("/doc/benevole")
    await waitForHydration(page.getByRole("button", { name: "Thème sombre" }))
    await page.evaluate((id) => {
      window.location.hash = id
    }, ANCHOR)
    await expect(page).toHaveURL(new RegExp(`${UNIT}$`))
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Revenir sur la page d'inscription")
  })
})
