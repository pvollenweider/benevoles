import { test, expect } from "@playwright/test"

/**
 * Unlisted events (#414): two published events in one organization; the unlisted one is absent
 * from the public home page but opens by its link and takes a sign-up.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("an unlisted event stays off the public page but works by direct link", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const stamp = Date.now()
  const make = async (title: string, isListed: boolean) => {
    const created = await page.request.post("/api/admin/events", { data: { title, startDate: "2031-06-06", endDate: "2031-06-06" } })
    const event: { id: string; slug: string } = await created.json()
    const shift = await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2031-06-06", startTime: "10:00", endTime: "12:00", capacity: 5 },
    })
    expect(shift.ok()).toBeTruthy()
    const published = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published", isListed } })
    expect(published.ok()).toBeTruthy()
    return event
  }
  const listed = await make(`E2E Listed ${stamp}`, true)
  const unlisted = await make(`E2E Unlisted ${stamp}`, false)

  // Admin shows the state.
  await page.goto(`/admin/events/${unlisted.id}`)
  await expect(page.getByText("Publié — non répertorié.")).toBeVisible()

  // Public home page: only the listed one.
  await page.goto("/?org=default")
  await expect(page.getByRole("link", { name: new RegExp(`E2E Listed ${stamp}`) })).toBeVisible()
  await expect(page.getByText(`E2E Unlisted ${stamp}`)).toHaveCount(0)

  // Public list API: same.
  const list: { slug: string }[] = await (await page.request.get("/api/public/events?org=default")).json()
  expect(list.some((e) => e.slug === listed.slug)).toBe(true)
  expect(list.some((e) => e.slug === unlisted.slug)).toBe(false)

  // Direct link: schedule visible, sign-up possible, page not indexed.
  await page.goto(`/${unlisted.slug}?org=default`)
  await expect(page.getByRole("heading", { level: 1 }).last()).toContainText(`E2E Unlisted ${stamp}`)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
  const signup = await page.request.get(`/api/public/${unlisted.slug}?org=default`)
  expect(signup.ok()).toBeTruthy()
  const data: { shifts: { id: string }[] } = await signup.json()
  expect(data.shifts.length).toBeGreaterThan(0)
})
