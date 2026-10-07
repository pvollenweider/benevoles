import { test, expect } from "@playwright/test"

// #764: the home page leads to the quickstart from its first screen, and to the essential guides.
// Its accessibility scan and structured data are checked by accessibility.spec.ts and seo.spec.ts.

const QUICKSTART = "/doc/creer-son-premier-evenement"

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 667 }]) {
  test(`the quickstart link is in the first screen at ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    const hero = page.locator("section").first()
    const link = hero.getByRole("link", { name: "Guide : créer son premier événement" })
    await expect(link).toHaveAttribute("href", QUICKSTART)
    await expect(link).toBeInViewport()
    // The mailto CTA stays first.
    await expect(hero.getByRole("link").first()).toHaveAccessibleName(/^Demander un espace/)
  })
}

test("« Bien démarrer » lists at least five documentation units in order, then the volunteers' guide apart", async ({ page }) => {
  await page.goto("/")
  const block = page.getByRole("region", { name: "Bien démarrer" })
  const steps = block.locator("ol > li")
  await expect(steps.first().getByRole("link")).toHaveText("Créer son premier événement")
  const hrefs = await steps.getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")))
  expect(hrefs[0]).toBe(QUICKSTART)
  expect(hrefs.filter((h) => /^\/doc\/[a-z0-9-]+$/.test(h ?? "")).length).toBeGreaterThanOrEqual(5)
  expect(hrefs).not.toContain("/doc/benevole")
  await expect(block.getByRole("link", { name: "Guide bénévole" })).toHaveAttribute("href", "/doc/benevole")
  await expect(block.getByRole("link", { name: "Toute la documentation" })).toHaveAttribute("href", "/doc")
})
