import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * Reordering an event's pages with the keyboard (#605, the #604 pattern): focus stays on the
 * pressed button, each press is announced once, an end says so without moving, and the order is
 * saved. A failed save puts the confirmed order back and says so.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function openPages(page: Page): Promise<string> {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  const res = await page.request.post("/api/admin/events", {
    data: { title: `E2E Pages ${Date.now()}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const event: { id: string } = await res.json()
  for (const title of ["Accès", "Parking", "FAQ"]) {
    const r = await page.request.post(`/api/admin/events/${event.id}/pages`, { data: { title, content: `Contenu ${title}` } })
    expect(r.ok(), await r.text()).toBeTruthy()
  }
  await page.goto(`/admin/events/${event.id}/pages`)
  await expect(page.getByRole("list", { name: "Ordre des pages" })).toBeVisible()
  return event.id
}

const order = (page: Page) =>
  page.getByRole("list", { name: "Ordre des pages" }).getByRole("listitem").evaluateAll((items) =>
    items.map((li) => li.querySelector("[aria-label^='Monter la page ']")?.getAttribute("aria-label")?.replace(/^Monter la page « (.*) »$/, "$1")),
  )
const status = (page: Page) => page.getByRole("status").filter({ hasText: /\S/ })

test("Monter / Descendre: focus kept, one announcement per press, end said without moving, order saved", async ({ page }) => {
  const eventId = await openPages(page)
  expect(await order(page)).toEqual(["Accès", "Parking", "FAQ"])

  const down = page.getByRole("button", { name: "Descendre la page « Accès »" })
  await down.focus()
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/admin/events/${eventId}/pages/reorder`) && r.request().method() === "POST")
  await page.keyboard.press("Enter")
  expect((await saved).ok()).toBe(true)
  await expect(down).toBeFocused()
  expect(await order(page)).toEqual(["Parking", "Accès", "FAQ"])
  await expect(status(page)).toHaveCount(1)
  await expect(status(page)).toHaveText("Page « Accès » déplacée en position 2 sur 3.")

  await page.keyboard.press("Enter")
  await expect(down).toBeFocused()
  await expect(down).toHaveAttribute("aria-disabled", "true")
  await expect(status(page)).toHaveText("Page « Accès » déplacée en dernière position.")
  await page.keyboard.press("Enter")
  await expect(down).toBeFocused()
  await expect(status(page)).toHaveText("La page « Accès » est déjà en dernière position.")
  expect(await order(page)).toEqual(["Parking", "FAQ", "Accès"])

  // Let the queued saves finish, then check the order survived a reload.
  await page.waitForLoadState("networkidle")
  await page.reload()
  await expect(page.getByRole("list", { name: "Ordre des pages" })).toBeVisible()
  expect(await order(page)).toEqual(["Parking", "FAQ", "Accès"])

  expect(await seriousViolations(page)).toEqual([])
})

test("a failed save puts the confirmed order back, says so, and keeps focus on the pressed button", async ({ page }) => {
  const eventId = await openPages(page)
  await page.route(`**/api/admin/events/${eventId}/pages/reorder`, (route) => route.fulfill({ status: 500, body: "{}" }))
  const up = page.getByRole("button", { name: "Monter la page « FAQ »" })
  await up.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("alert").filter({ hasText: "L'ordre des pages n'a pas pu être enregistré." })).toBeVisible()
  expect(await order(page)).toEqual(["Accès", "Parking", "FAQ"])
  await expect(up).toBeFocused()
})
