import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"

/**
 * The event edit form saves on its own (#616): a save is announced once in a status region and
 * shows its time (later saves are silent: covered by EventForm.react.test.tsx); a failed save shows
 * an alert that stays, with « Réessayer », until a save succeeds.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function openEdit(page: Page): Promise<string> {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  const res = await page.request.post("/api/admin/events", {
    data: { title: `E2E Autosave ${Date.now()}`, startDate: "2031-06-01", endDate: "2031-06-01", publicStatus: "draft" },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const event: { id: string } = await res.json()
  await page.goto(`/admin/events/${event.id}/edit`)
  await waitForHydration(page.locator("#event-title"))
  return event.id
}

const announced = (page: Page) => page.getByRole("status").filter({ hasText: "Modifications enregistrées." })

test("a save is announced once and shows its time; no unreadable coloured toast", async ({ page }) => {
  await openEdit(page)
  const title = page.locator("#event-title")
  await title.fill("Fête du village, édition 1")
  await expect(page.getByText(/^Modifications enregistrées à \d{1,2}h(\d{2})?\.$/)).toBeVisible()
  await expect(announced(page)).toHaveCount(1)

  // No white-on-green or white-on-red message any more.
  await expect(page.locator(".bg-green-500, .bg-red-500")).toHaveCount(0)
  expect(await seriousViolations(page)).toEqual([])
})

test("a failed save shows an alert that stays, and « Réessayer » sends again", async ({ page }) => {
  const eventId = await openEdit(page)
  await page.route(`**/api/admin/events/${eventId}`, (route) =>
    route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
  )
  await page.locator("#event-title").fill("Titre qui ne passe pas")
  const alert = page.getByRole("alert").filter({ hasText: "Les modifications n'ont pas été enregistrées." })
  await expect(alert).toBeVisible()
  await page.waitForTimeout(3000)
  await expect(alert).toBeVisible()

  await page.unroute(`**/api/admin/events/${eventId}`)
  const resent = page.waitForResponse((r) => r.url().endsWith(`/api/admin/events/${eventId}`) && r.request().method() === "PATCH")
  await page.getByRole("button", { name: "Réessayer" }).click()
  expect((await resent).ok()).toBe(true)
  await expect(alert).toBeHidden()
  await expect(announced(page)).toHaveCount(1)
})
