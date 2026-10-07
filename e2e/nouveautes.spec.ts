// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * /nouveautes (#757): the released versions of CHANGELOG.md, newest first, each under its
 * anchored heading with its date; never [Unreleased] nor the operators' sections; reached from the
 * public footer and from /doc; no serious axe violation, light or dark, and no horizontal scroll
 * on a 320 px phone. Canonical, social card and structured data: e2e/seo.spec.ts.
 */

test("lists the released versions, newest first, each linked to its anchored heading with its date", async ({ page }) => {
  await page.goto("/nouveautes")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nouveautés")
  await expect(page).toHaveTitle("Nouveautés, version par version | benevol.app")

  const toc = page.getByRole("navigation", { name: "Toutes les versions" })
  const links = toc.getByRole("link")
  expect(await links.count()).toBeGreaterThan(10)
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!))
  for (const href of hrefs) {
    const id = href.slice(1)
    const heading = page.locator(`h2[id="${id}"]`)
    await expect(heading, href).toHaveText(`Version ${id}`)
  }

  // Newest first: the dates of the versions never go up.
  const dates = await page.locator("main section time").evaluateAll((ts) => ts.map((t) => t.getAttribute("datetime")!))
  expect(dates.length).toBe(hrefs.length)
  expect(dates).toEqual([...dates].sort().reverse())

  await links.first().click()
  await expect(page).toHaveURL(new RegExp(`${hrefs[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
})

test("shows the public sections only, never [Unreleased], and links to site pages rather than files", async ({ page }) => {
  await page.goto("/nouveautes")
  const main = page.getByRole("main")
  await expect(main.getByRole("heading", { level: 3, name: "Ajouté" }).first()).toBeVisible()
  await expect(main).not.toContainText("Unreleased")
  // Every section is a public one: « Mise à jour depuis … », « Infrastructure »... stay on GitHub.
  const sections = await main.locator("section h3").allTextContents()
  expect(sections.length).toBeGreaterThan(20)
  for (const title of sections) expect(title).toMatch(/^(En bref|Ajouté|Modifié|Amélioré|Corrigé|Corrections notables|Supprimé|Sécurité|Accessibilité|Fonctionnalités)( |$)/)
  // Every link leads to a page of the site or to a full URL: never a relative file, a 404 here.
  const hrefs = await main.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))
  for (const href of hrefs) expect(href).toMatch(/^(\/|#|https:\/\/|mailto:)/)
  await expect(main.getByRole("link", { name: "journal complet des versions sur GitHub" })).toHaveAttribute("href", /github\.com\/pvollenweider\/benevoles\/blob\/main\/CHANGELOG\.md$/)
})

test("is reached from the public footer and from the documentation", async ({ page }) => {
  await page.goto("/doc")
  await expect(page.getByRole("main").getByRole("link", { name: "nouveautés" })).toHaveAttribute("href", "/nouveautes")
  await page.getByRole("navigation", { name: "Liens utiles" }).getByRole("link", { name: "Nouveautés" }).click()
  await expect(page).toHaveURL(/\/nouveautes$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nouveautés")
})

test("has no serious accessibility violation, light theme", async ({ page }) => {
  await page.goto("/nouveautes")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test.describe("on a phone, in dark mode", () => {
  test.use({ viewport: { width: 320, height: 640 }, colorScheme: "dark" })

  test("has no serious accessibility violation and no horizontal scroll", async ({ page }) => {
    await page.goto("/nouveautes")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.locator("[data-theme-scope]")).toHaveClass(/\bdark\b/)
    expect(await seriousViolations(page)).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBe(0)
  })
})
