// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * /remplacer-tableur-benevoles (#767), the editorial page rendered from
 * REMPLACER-TABLEUR-BENEVOLES.md with the layout of /fonctionnalites: one title matching the
 * search, its sections and the three steps of the move, a visible FAQ that is word for word its
 * FAQPage data, every internal link answering, the email request at the top and at the bottom, no
 * serious axe violation in light or dark, no horizontal scroll at 320 px.
 */
const PATH = "/remplacer-tableur-benevoles"

test("answers the search with one title, its sections, the three steps and the email request at the top and at the bottom", async ({ page }) => {
  await page.goto(PATH)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Remplacer le tableur des bénévoles")
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
  for (const heading of ["Ce que le tableur fait bien", "Là où il coince", "Passer du tableur à benevol.app en trois étapes", "Importer la liste de vos bénévoles", "Recréer le planning", "Garder un tableur sous la main", "Questions fréquentes"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible()
  }
  for (const step of ["Importez vos bénévoles", "Recréez les postes et les créneaux", "Partagez le lien"]) {
    await expect(page.getByRole("heading", { level: 3, name: step })).toBeVisible()
  }
  const requests = page.getByRole("link", { name: /^Demander un espace par email \(contact@benevol\.app\)/ })
  await expect(requests).toHaveCount(2)
  for (const href of await requests.evaluateAll((links) => links.map((a) => a.getAttribute("href")))) {
    expect(href).toMatch(/^mailto:contact@benevol\.app\?subject=.+&body=.+/)
  }
})

test("shows every FAQ question and answer, the same words as its FAQPage structured data", async ({ page }) => {
  await page.goto(PATH)
  const data = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}")))
  const faq = data.flatMap((d) => d["@graph"] ?? [d]).find((n: { "@type": string }) => n["@type"] === "FAQPage")
  const questions = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]
  expect(questions.length).toBeGreaterThanOrEqual(6)
  for (const q of questions) {
    const heading = page.getByRole("heading", { level: 3, name: q.name })
    await expect(heading).toBeVisible()
    const answer = heading.locator("xpath=following-sibling::div[1]")
    await expect(answer).toBeVisible()
    expect((await answer.innerText()).replace(/\s+/g, " ").trim()).toBe(q.acceptedAnswer.text)
  }
})

test("every internal link of the page answers", async ({ page, request }) => {
  await page.goto(PATH)
  const hrefs = await page.locator("main a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!.split("#")[0]))])
  expect(hrefs.length).toBeGreaterThan(10)
  for (const href of hrefs) {
    const response = await request.get(href)
    expect(response.status(), href).toBe(200)
  }
  // An anchor of the page leads to its own heading.
  for (const href of await page.locator("main a[href^='#']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    await expect(page.locator(href), href).toHaveCount(1)
  }
})

test("is linked from /logiciel-planning-benevoles and from /fonctionnalites, not from the header", async ({ page }) => {
  for (const from of ["/logiciel-planning-benevoles", "/fonctionnalites"]) {
    await page.goto(from)
    await expect(page.locator(`main a[href="${PATH}"]`).first(), from).toBeVisible()
    await expect(page.locator(`header a[href="${PATH}"]`), from).toHaveCount(0)
  }
})

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no serious violation, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto(PATH)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page)).toEqual([])
  })
}

test("reflows at 320 px without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(PATH)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})
