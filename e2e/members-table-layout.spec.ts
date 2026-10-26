import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * Members list layout (#1102): on a wide window the table fits its (wider) page with the row
 * actions on one line, nothing cut at the right edge; on a phone the table scrolls inside its own
 * region, says so, and the page itself never scrolls sideways.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const HINT = "Le tableau est plus large que l'écran : faites-le défiler horizontalement pour voir toutes les colonnes (au clavier, sélectionnez-le puis utilisez les flèches gauche et droite)."

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
}

async function openListWithLongMember(page: Page) {
  const suffix = Date.now()
  const lastName = `de Montmollin-Vuilleumier ${suffix}`
  const res = await page.request.post("/api/admin/members", {
    data: { firstName: "Gwendoline-Éléonore", lastName, email: `gwendoline.eleonore.de.montmollin.vuilleumier.${suffix}@long-address.example.org`, phone: "079 123 45 67" },
  })
  expect(res.ok(), `${res.status()} ${await res.text()}`).toBeTruthy()
  await page.goto(`/admin/members?q=${suffix}`)
  const row = page.getByRole("row", { name: new RegExp(`Gwendoline-Éléonore.*${suffix}`) })
  await expect(row).toBeVisible()
  await waitForHydration(row.getByRole("button", { name: /^Modifier/ }))
  return row
}

const pageScrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)

for (const width of [1830, 1280]) {
  test(`members table fits at ${width}px, row actions on one line`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    const row = await openListWithLongMember(page)

    const region = page.getByRole("region", { name: "Liste des membres" })
    expect(await region.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByText(HINT)).toHaveCount(0)
    expect(await pageScrollsSideways(page)).toBe(false)

    // The three actions sit side by side, all inside the visible region.
    const actions = [
      row.getByRole("link", { name: /^Activité de Gwendoline-Éléonore/ }),
      row.getByRole("button", { name: /^Modifier Gwendoline-Éléonore/ }),
      row.getByRole("button", { name: /^Désactiver Gwendoline-Éléonore/ }),
    ]
    const regionBox = (await region.boundingBox())!
    const boxes = await Promise.all(actions.map(async (a) => (await a.boundingBox())!))
    for (const box of boxes) {
      expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(2)
      expect(box.x + box.width).toBeLessThanOrEqual(regionBox.x + regionBox.width)
    }
    // One line of actions, not three stacked (the row's height then follows its content).
    const actionsBox = (await actions[1].locator("xpath=..").boundingBox())!
    expect(actionsBox.height).toBeLessThan(boxes[1].height * 1.5)
  })
}

for (const width of [375, 320]) {
  test(`members table scrolls in its own region at ${width}px, with a visible cue`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 800 })
    await login(page)
    await openListWithLongMember(page)

    const region = page.getByRole("region", { name: "Liste des membres" })
    expect(await region.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(1)
    const hint = page.getByText(HINT)
    await expect(hint).toBeVisible()
    await expect(region).toHaveAccessibleDescription(HINT)
    expect(await pageScrollsSideways(page)).toBe(false)
  })
}
