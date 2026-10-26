import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { seriousViolations } from "./helpers/axe"

/**
 * The tabs of an event: on every page of the event, without going back to the overview. The
 * current tab and page are marked (aria-current), the « Autres actions » disclosure holds the
 * rarer pages, the row fits a 390 px phone by scrolling sideways, and nothing serious for axe.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
}

async function draftEvent(page: Page, title: string): Promise<string> {
  const res = await page.request.post("/api/admin/events", { data: { title, startDate: "2031-06-12", endDate: "2031-06-13", publicStatus: "draft" } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).id
}

test("from one sub-page to another through the tabs, never through the overview", async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = `E2E Onglets ${Date.now()}`
  const id = await draftEvent(page, title)
  const base = `/admin/events/${id}`

  await page.goto(`${base}/shifts`)
  const tabs = page.getByRole("navigation", { name: "Sections de l'événement" })
  await expect(tabs.getByRole("link", { name: "Créneaux" })).toHaveAttribute("aria-current", "page")
  // The event's title is a line of the header here, the page's own <h1> is « Créneaux ».
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Créneaux")
  await expect(page.getByText(title, { exact: true })).toBeVisible()
  // Empty draft: the primary action « Ajouter des créneaux » is not repeated on the shifts page.
  await expect(page.getByRole("link", { name: "Ajouter des créneaux" })).toHaveCount(0)
  await expect(page).toHaveTitle(new RegExp(`^Créneaux – ${title}`))

  await tabs.getByRole("link", { name: "Inscriptions" }).click()
  await expect(page).toHaveURL(new RegExp(`${base}/registrations$`))
  await expect(page.getByRole("heading", { level: 1, name: "Inscriptions" })).toBeVisible()
  await expect(tabs.getByRole("link", { name: "Inscriptions" })).toHaveAttribute("aria-current", "page")
  await expect(tabs.getByRole("link", { name: "Créneaux" })).not.toHaveAttribute("aria-current", /.*/)

  // A page of the tab: Invitations, the tab stays marked (true), the page is the current one.
  const sub = page.getByRole("navigation", { name: "Pages de la section Inscriptions" })
  await sub.getByRole("link", { name: "Invitations" }).click()
  await expect(page).toHaveURL(new RegExp(`${base}/invitations$`))
  await expect(tabs.getByRole("link", { name: "Inscriptions" })).toHaveAttribute("aria-current", "true")
  await expect(sub.getByRole("link", { name: "Invitations" })).toHaveAttribute("aria-current", "page")

  // Réglages, then Questions, with the keyboard.
  await tabs.getByRole("link", { name: "Réglages" }).focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(new RegExp(`${base}/edit$`))
  const settings = page.getByRole("navigation", { name: "Pages de la section Réglages" })
  await settings.getByRole("link", { name: "Questions" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Questions aux bénévoles" })).toBeVisible()

  // « Autres actions »: a disclosure, Escape closes it on its button.
  const more = page.getByRole("button", { name: "Autres actions" })
  await waitForHydration(more)
  await more.click()
  await expect(more).toHaveAttribute("aria-expanded", "true")
  await page.getByRole("link", { name: "Journal" }).click()
  await expect(page).toHaveURL(new RegExp(`${base}/log$`))
  await expect(more).toHaveAttribute("aria-expanded", "false")

  // Back to the overview: the title is its <h1>, then « Où manque-t-il du monde ? » first.
  await tabs.getByRole("link", { name: "Aperçu" }).click()
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Où manque-t-il du monde ?")
  await expect(page.getByRole("link", { name: "Ajouter des créneaux" }).first()).toBeVisible()

  expect(await seriousViolations(page)).toEqual([])
})

test("at 390 px the tabs stay on one row that scrolls, the current one in view", async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  const id = await draftEvent(page, `E2E Onglets mobile ${Date.now()}`)
  await page.goto(`/admin/events/${id}/edit`)
  const tabs = page.getByRole("navigation", { name: "Sections de l'événement" })
  const current = tabs.getByRole("link", { name: "Réglages" })
  await expect(current).toHaveAttribute("aria-current", "page")
  await expect(current).toBeInViewport()
  const first = await tabs.getByRole("link", { name: "Aperçu" }).boundingBox()
  const last = await current.boundingBox()
  expect(Math.abs(first!.y - last!.y)).toBeLessThan(2)
  // No horizontal scroll of the page itself.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
