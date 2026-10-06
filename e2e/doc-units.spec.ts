import { test, expect, type Page } from "@playwright/test"
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
  // The volunteers' half comes first, as the jump links offer it.
  await page.goto("/doc/rappels")
  await expect(page.locator("main h2").filter({ hasText: /^Côté / })).toHaveText(["Côté bénévole", "Côté organisation"])
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
  await expect(page.getByRole("heading", { level: 2, name: "Toutes les fiches" })).toBeVisible()
  // Named region, like « Questions fréquentes » on the guides.
  await expect(page.getByRole("region", { name: "Toutes les fiches" }).getByRole("heading", { level: 3, name: "Après l'inscription" })).toBeVisible()
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

// The heading levels of the page's main content, in order.
const headingLevels = (page: Page) => page.locator("main").locator("h1, h2, h3, h4, h5, h6").evaluateAll((hs) => hs.filter((h) => (h as HTMLElement).offsetParent !== null).map((h) => Number(h.tagName[1])))

test("both guides open on their introduction, then their questions and their index, with a valid outline", async ({ page }) => {
  await page.goto("/doc/benevole")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Guide bénévole")
  const headings = page.getByRole("heading", { level: 2 })
  await expect(headings).toHaveText(["Questions fréquentes", "Toutes les fiches"])
  await expect(page.getByRole("heading", { name: "Le guide complet" })).toHaveCount(0)
  // The welcome (GUIDE_BENEVOLE.md) comes first, in « tu », before the questions.
  const welcome = page.locator("main p", { hasText: /^Bienvenue/ })
  await expect(welcome).toContainText("Tu donnes un coup de main")
  expect(await welcome.evaluate((p) => {
    const faq = document.getElementById("faq-du-guide")!
    return Boolean(p.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING)
  })).toBe(true)
  // The volunteers' own groups first.
  await expect(page.getByRole("heading", { level: 3 }).first()).toHaveText("S'inscrire à un créneau")
  for (const group of ["S'inscrire à un créneau", "Après l'inscription", "Règles d'inscription"]) {
    await expect(page.getByRole("heading", { level: 3, name: group })).toBeVisible()
  }
  await expect(page.locator("main li").getByRole("link", { name: "S'inscrire", exact: true })).toHaveAttribute("href", "/doc/s-inscrire")

  await page.goto("/doc/admin")
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Questions fréquentes", "Toutes les fiches"])
  await expect(page.locator("main p", { hasText: /^Bienvenue/ })).not.toContainText("figure en tête")
  // The organisers' groups start at « Démarrer ».
  await expect(page.getByRole("heading", { level: 3 }).first()).toHaveText("Démarrer")
  // A link name always leads to one place on the page (the introduction also links to units).
  const links = await page.locator("main a").evaluateAll((as) => as.map((a) => [a.textContent?.trim(), a.getAttribute("href")]))
  const hrefByName = new Map<string, Set<string>>()
  for (const [name, href] of links) hrefByName.set(name ?? "", (hrefByName.get(name ?? "") ?? new Set<string>()).add(href ?? ""))
  for (const [name, hrefs] of hrefByName) expect(hrefs.size, name).toBe(1)
  await expect(page.locator("main a", { hasText: "Rappels et changements de créneau" }).first()).toHaveAttribute("href", "/doc/rappels")
  await expect(page.getByRole("heading", { level: 3, name: "Préparer l'événement" })).toBeVisible()
  await expect(page.locator("main li").getByRole("link", { name: "Premiers pas", exact: true })).toHaveAttribute("href", "/doc/premiers-pas")
  // No volunteer-only unit in the organisers' index.
  await expect(page.locator("main a", { hasText: "Revenir sur la page d'inscription" })).toHaveCount(0)

  // One <h1>, then no level skipped: the groups are <h3> under « Toutes les fiches ».
  for (const path of ["/doc/benevole", "/doc/admin"]) {
    await page.goto(path)
    const levels = await headingLevels(page)
    expect(levels.filter((l) => l === 1), path).toHaveLength(1)
    expect(levels[0], path).toBe(1)
    levels.forEach((level, i) => {
      if (i > 0) expect(level - levels[i - 1], `${path}: heading ${i}`).toBeLessThanOrEqual(1)
    })
  }
})

test.describe("a unit's navigation on a wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("the side menu lists every group, opens the current one and marks the current unit", async ({ page }) => {
    await page.goto("/doc/rappels")
    const menu = page.getByRole("navigation", { name: "Documentation" })
    await expect(menu).toBeVisible()
    // Outside <main>: « Aller au contenu » skips it.
    expect(await menu.evaluate((nav) => nav.closest("main") === null)).toBe(true)
    await expect(menu.locator("summary")).toHaveCount(12)
    const current = menu.locator('[aria-current="page"]')
    await expect(current).toHaveCount(1)
    await expect(current).toHaveText("Rappels et changements de créneau")
    await expect(current).toHaveCSS("font-weight", "600")
    await expect(menu.locator("details[open] > summary")).toHaveText(["Après l'inscription"])
    // Another group opens from the keyboard and leads to its units.
    const other = menu.locator("summary", { hasText: "Préparer l'événement" })
    await other.focus()
    await page.keyboard.press("Enter")
    await menu.getByRole("link", { name: "Configurer les créneaux", exact: true }).click()
    await expect(page).toHaveURL(/\/doc\/configurer-les-creneaux$/)
    await expect(page.getByRole("navigation", { name: "Documentation" }).locator('[aria-current="page"]')).toHaveText("Configurer les créneaux")
    // « Dans ce thème » is for narrow screens only.
    await expect(page.getByRole("heading", { level: 2, name: "Dans ce thème" })).toBeHidden()
  })

  test("previous and next stay in the unit's group, named after their target", async ({ page }) => {
    await page.goto("/doc/rappels")
    const pager = page.getByRole("navigation", { name: "Pages du thème" })
    await expect(pager.getByRole("link")).toHaveCount(2)
    await expect(pager.getByRole("link", { name: "Précédent : Revenir sur la page d'inscription" })).toHaveAttribute("href", "/doc/revenir-sur-la-page-d-inscription")
    await expect(pager.getByRole("link", { name: "Suivant : Questions fréquentes des bénévoles" })).toHaveAttribute("href", "/doc/questions-frequentes-benevole")
    // The last unit of its group has no next one: nothing crosses into « Règles d'inscription ».
    await page.goto("/doc/questions-frequentes-benevole")
    await expect(page.getByRole("navigation", { name: "Pages du thème" }).getByRole("link")).toHaveText([/^Précédent/])
  })

  test("a shared unit jumps to the volunteers' half, then the organisers'", async ({ page }) => {
    await page.goto("/doc/rappels")
    const jumps = page.getByRole("list", { name: "Sur cette page" })
    await expect(jumps.getByRole("link")).toHaveText(["Côté bénévole", "Côté organisation"])
    await jumps.getByRole("link", { name: "Côté bénévole" }).click()
    await expect(page).toHaveURL(/\/doc\/rappels#cote-benevole$/)
    await expect(page.getByRole("heading", { level: 2, name: "Côté bénévole" })).toBeInViewport()
    await jumps.getByRole("link", { name: "Côté organisation" }).click()
    await expect(page).toHaveURL(/#cote-organisation$/)
    await expect(page.getByRole("heading", { level: 2, name: "Côté organisation" })).toBeInViewport()
    // A unit for one audience has none.
    await page.goto(UNIT)
    await expect(page.getByRole("list", { name: "Sur cette page" })).toHaveCount(0)
  })
})

test.describe("a unit's navigation on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("no side menu, the other units of the group at the bottom instead", async ({ page }) => {
    await page.goto("/doc/rappels")
    await expect(page.getByRole("navigation", { name: "Documentation" })).toBeHidden()
    const theme = page.getByRole("region", { name: "Dans ce thème" })
    await expect(theme).toBeVisible()
    await expect(theme.getByRole("listitem")).toHaveText(["Ma page personnelle", "Ton lien personnel", "Revenir sur la page d'inscription", "Questions fréquentes des bénévoles"])
    await expect(theme.getByRole("link", { name: "Après l'inscription" })).toHaveAttribute("href", "/doc#apres-inscription")
    await expect(page.getByRole("navigation", { name: "Pages du thème" }).getByRole("link")).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test("the filter over the index narrows the list as you type, hides empty groups and says the result", async ({ page }) => {
  await page.goto("/doc/benevole")
  const field = page.getByRole("searchbox", { name: "Filtrer les fiches" })
  await expect(field).toBeVisible()
  await expect(field).toHaveAttribute("type", "search")
  const status = page.locator("main").getByRole("status")
  await expect(status).toHaveText("")
  // Every link of the page's lists: the four frequent questions, then one per unit.
  const allLinks = await page.locator("main li").getByRole("link").count()

  // Accents and case don't matter; every word must match.
  await field.fill("LIEN perdu")
  await expect(status).toHaveText(/^1 fiche sur \d+ correspond à « LIEN perdu »\.$/)
  await expect(page.locator("main li").getByRole("link", { name: "Ton lien personnel", exact: true })).toBeVisible()
  await expect(page.locator("main li").getByRole("link", { name: "S'inscrire", exact: true })).toBeHidden()
  // A group without any match is hidden whole, heading included.
  await expect(page.getByRole("heading", { level: 3, name: "S'inscrire à un créneau" })).toHaveCount(0)
  await expect(page.getByRole("heading", { level: 3, name: "Après l'inscription" })).toBeVisible()
  await expect(field).toBeFocused()

  await field.fill("creneau changer")
  await expect(page.locator("main li").getByRole("link", { name: "Ma page personnelle", exact: true })).toBeVisible()

  // A unit found by one of its questions links to it, under its result.
  await field.fill("oublier")
  const result = page.locator("main li").filter({ has: page.getByRole("link", { name: "Rappels et changements de créneau", exact: true }) })
  const question = result.getByRole("link", { name: "Je ne veux pas oublier mon créneau le jour J" })
  await expect(question).toBeVisible()
  await expect(question).toHaveAttribute("href", "/doc/rappels#je-ne-veux-pas-oublier-mon-creneau-le-jour-j")
  await expect(field).toBeFocused()

  await field.fill("xyz")
  await expect(status).toHaveText("Aucune fiche pour « xyz ».")
  await expect(page.getByText(/^Essaie un autre mot/)).toBeVisible()
  await expect(page.locator("main").getByText(/Aucune fiche/)).toHaveCount(1)
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0)
  await expect(page.getByRole("search").getByRole("searchbox", { name: "Filtrer les fiches" })).toBeVisible()
  // Next steps: the guide's own frequent questions.
  await expect(page.locator("main li:visible").getByRole("link", { name: "Questions fréquentes", exact: true })).toHaveAttribute("href", "#faq-du-guide")

  // « Effacer le filtre » (Firefox has no clear button of its own) brings every unit back.
  await page.getByRole("button", { name: "Effacer le filtre" }).click()
  await expect(field).toHaveValue("")
  await expect(field).toBeFocused()
  await expect(page.locator("main li:visible").getByRole("link")).toHaveCount(allLinks)
  await expect(page.getByRole("button", { name: "Effacer le filtre" })).toHaveCount(0)

  await field.fill("xyz")
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(0)

  await field.press("Escape")
  await expect(field).toHaveValue("")
  await expect(field).toBeFocused()
  await expect(status).toHaveText(`Les ${allLinks - 4} fiches sont affichées.`)
  await expect(page.locator("main li:visible").getByRole("link")).toHaveCount(allLinks)
  expect.soft(await seriousViolations(page)).toEqual([])
})

test("both guides open on their four frequent questions, each leading to its answer", async ({ page }) => {
  for (const path of ["/doc/benevole", "/doc/admin"]) {
    await page.goto(path)
    const faq = page.getByRole("region", { name: "Questions fréquentes" })
    await expect(faq.getByRole("heading", { level: 2, name: "Questions fréquentes" })).toBeVisible()
    const items = faq.getByRole("listitem")
    await expect(items).toHaveCount(4)
    const names = await faq.getByRole("link").allTextContents()
    expect(new Set(names).size, path).toBe(4)
    for (const name of names) expect(name, path).toMatch(/\u00a0\?$/)
  }
  await page.goto("/doc/benevole")
  await page.getByRole("region", { name: "Questions fréquentes" }).getByRole("link", { name: "Comment changer de créneau\u00a0?" }).click()
  await expect(page).toHaveURL(/\/doc\/ma-page-personnelle#changer-de-creneau$/)
  await expect(page.getByRole("heading", { level: 2, name: "Changer de créneau" })).toBeInViewport()
})

test("with no match, the filter leads to the frequent questions of the guide, or of both guides from /doc", async ({ page }) => {
  await page.goto("/doc/benevole")
  const field = page.getByRole("searchbox", { name: "Filtrer les fiches" })
  await field.fill("xyz")
  await page.locator("main li:visible").getByRole("link", { name: "Questions fréquentes", exact: true }).click()
  await expect(page).toHaveURL(/\/doc\/benevole#faq-du-guide$/)
  await expect(page.getByRole("heading", { level: 2, name: "Questions fréquentes" })).toBeInViewport()

  await page.goto("/doc")
  await page.getByRole("searchbox", { name: "Filtrer les fiches" }).fill("xyz")
  const next = page.getByRole("region", { name: "Toutes les fiches" }).locator("li:visible").getByRole("link")
  await expect(next).toHaveText(["Questions fréquentes des bénévoles", "Questions fréquentes des organisateurs", "Aide et retours"])
  await next.filter({ hasText: "des organisateurs" }).click()
  await expect(page).toHaveURL(/\/doc\/admin#faq-du-guide$/)
})

test.describe("old anchors of the guides", () => {
  test("an id still on the guide's page stays on the guide", async ({ page }) => {
    // Every section has left both guides: give a heading of the page the id of a moved section.
    await page.goto("/doc/admin")
    await waitForHydration(page.getByRole("button", { name: "Thème sombre" }))
    const id = await page.getByRole("heading", { level: 2, name: "Toutes les fiches" }).evaluate((h) => {
      h.id = "premiers-pas"
      return h.id
    })
    await page.evaluate((anchor) => {
      window.location.hash = anchor
    }, id)
    await expect(page).toHaveURL(/\/doc\/admin#premiers-pas$/)
    // Had it left, the next moved anchor would be set on the unit's page, not followed from here.
    await page.evaluate(() => {
      window.location.hash = "configurer-les-creneaux"
    })
    await expect(page).toHaveURL(/\/doc\/configurer-les-creneaux$/)
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
    await expect(page.getByRole("heading", { level: 3, name: "Rappels automatiques" })).toBeInViewport()
    await page.goto("/doc/benevole#confirmation")
    await expect(page).toHaveURL(/\/doc\/s-inscrire#confirmation$/)
    await page.goto("/doc/admin#page-blanche")
    await expect(page).toHaveURL(/\/doc\/creer-un-evenement#page-blanche$/)
    await expect(page.getByRole("heading", { level: 2, name: "Page blanche" })).toBeInViewport()
  })

  test("an organisers' section that moved without its heading opens its unit", async ({ page }) => {
    await page.goto("/doc/admin#configurer-les-creneaux")
    await expect(page).toHaveURL(/\/doc\/configurer-les-creneaux$/)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Configurer les créneaux")
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
