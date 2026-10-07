// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { test, expect } from "@playwright/test"

/**
 * /fonctionnalites, the decision page laid out from FEATURES.md (src/lib/features-page.ts): the
 * promise, the email request at the top and at the bottom, « Sur cette page » leading to every
 * section, the three steps, no horizontal scroll on a phone. The stills and players need
 * VIDEO_MEDIA_BASE_URL (unset in the default e2e environment): with it, every still has its alt
 * text and loads; without it, there is none, never a broken image. The axe scan of the page is in
 * e2e/accessibility.spec.ts.
 */
const withMedia = Boolean(process.env.VIDEO_MEDIA_BASE_URL)

test("opens with the promise and asks for a space by email, at the top and at the bottom", async ({ page }) => {
  await page.goto("/fonctionnalites")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Le planning de vos bénévoles, simplement")
  const requests = page.getByRole("link", { name: /^Demander un espace par email \(contact@benevol\.app\)/ })
  await expect(requests).toHaveCount(2)
  for (const href of await requests.evaluateAll((links) => links.map((a) => a.getAttribute("href")))) {
    expect(href).toMatch(/^mailto:contact@benevol\.app\?subject=.+&body=.+/)
  }
  await expect(page.getByText(/Gratuit, open source et hébergé en France/)).toBeVisible()
})

test("« Sur cette page » leads to every section, and « Comment ça marche » has three steps", async ({ page }) => {
  await page.goto("/fonctionnalites")
  const toc = page.getByRole("navigation", { name: "Sur cette page" })
  const links = toc.getByRole("link")
  expect(await links.count()).toBeGreaterThan(10)
  for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    await expect(page.locator(`h2${href}`), href).toHaveCount(1)
  }
  await toc.getByRole("link", { name: "Comment ça marche" }).click()
  await expect(page).toHaveURL(/#comment-ca-marche$/)
  const steps = page.locator("section[aria-labelledby='comment-ca-marche'] ol > li")
  await expect(steps).toHaveCount(3)
  await expect(steps.first().getByRole("heading", { level: 3 })).toHaveText("Étape 1 : Préparez le planning")
})

test("speaks to a volunteer who lands here: open the link received by email", async ({ page }) => {
  await page.goto("/fonctionnalites")
  await expect(page.getByText(/Bénévole \?/)).toBeVisible()
  await expect(page.getByRole("link", { name: "Le recevoir à nouveau" })).toHaveAttribute("href", "/doc/lien-personnel")
})

test("stills: each one has its alt text and loads, or there is none", async ({ page }) => {
  await page.goto("/fonctionnalites", { waitUntil: "networkidle" })
  const images = page.locator("main img")
  if (!withMedia) {
    await expect(images).toHaveCount(0)
    return
  }
  expect(await images.count()).toBeGreaterThanOrEqual(7)
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded()
    expect((await image.getAttribute("alt"))?.length).toBeGreaterThan(20)
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  }
})

test("fits a 375 px phone without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/fonctionnalites")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})
