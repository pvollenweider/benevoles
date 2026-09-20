import { test, expect, type Browser, type APIRequestContext } from "@playwright/test"

/**
 * Event deletion must never touch another event or another organization.
 *
 * Setup: a throwaway org B next to the seeded "default" org A, with an archived
 * event in each that share the SAME title (hence the same slug), each with a
 * shift. The org-A admin then tries to delete: the org-B event (must 404), a
 * published event (409), with a wrong title (400), and finally its own archived
 * event (200). The org-B twin must be untouched at every step.
 */

const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(browser: Browser, email: string, password: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
  return { context, page }
}

async function createArchivedEventWithShift(request: APIRequestContext, title: string, status = "archived") {
  const res = await request.post("/api/admin/events", {
    data: { title, startDate: "2030-07-01", endDate: "2030-07-02", publicStatus: status },
  })
  expect(res.ok()).toBeTruthy()
  const event = await res.json()
  const shift = await request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Test", label: "Test shift", date: "2030-07-01", startTime: "10:00", endTime: "12:00", capacity: 3 },
  })
  expect(shift.ok()).toBeTruthy()
  return event as { id: string; slug: string; title: string }
}

test("deleting an event never affects another event or organization", async ({ browser }) => {
  const stamp = Date.now()
  const sharedTitle = `E2E Twin ${stamp}`
  const superAdmin = await login(browser, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
  const orgAdmin = await login(browser, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD)

  // Org B, with its own archived event carrying the same title and slug as org A's.
  const orgRes = await superAdmin.page.request.post("/api/super-admin/organizations", {
    data: { name: `e2e-del-${stamp}`, adminEmail: `e2e-del-${stamp}@example.com`, adminName: "E2E" },
  })
  expect(orgRes.ok()).toBeTruthy()
  const orgB: { id: string; slug: string } = (await orgRes.json()).org
  await superAdmin.page.request.get(`/api/super-admin/use-org/${orgB.id}`) // super admin now acts inside org B
  const twinB = await createArchivedEventWithShift(superAdmin.page.request, sharedTitle)
  const otherB = await createArchivedEventWithShift(superAdmin.page.request, `E2E Other B ${stamp}`)

  // Org A (default): archived twin, and a published event.
  const twinA = await createArchivedEventWithShift(orgAdmin.page.request, sharedTitle)
  const publishedA = await createArchivedEventWithShift(orgAdmin.page.request, `E2E Published ${stamp}`, "published")
  expect(twinA.slug).toBe(twinB.slug) // same slug in two organizations

  const existsInB = async (id: string) => (await superAdmin.page.request.get(`/api/admin/events/${id}`)).status() === 200
  const existsInA = async (id: string) => (await orgAdmin.page.request.get(`/api/admin/events/${id}`)).status() === 200
  const del = (id: string, confirmTitle?: string) =>
    orgAdmin.page.request.delete(`/api/admin/events/${id}`, { data: confirmTitle === undefined ? undefined : { confirmTitle } })

  try {
    // Another organization's events: refused, and still there.
    expect((await del(twinB.id, sharedTitle)).status()).toBe(404)
    expect((await del(otherB.id, otherB.title)).status()).toBe(404)
    expect(await existsInB(twinB.id)).toBe(true)
    expect(await existsInB(otherB.id)).toBe(true)

    // Own events: published (409), wrong or missing title (400).
    expect((await del(publishedA.id, publishedA.title)).status()).toBe(409)
    expect((await del(twinA.id, "not the title")).status()).toBe(400)
    expect((await del(twinA.id)).status()).toBe(400)
    expect(await existsInA(publishedA.id)).toBe(true)
    expect(await existsInA(twinA.id)).toBe(true)

    // Own archived event, title typed loosely (case and accents are ignored).
    expect((await del(twinA.id, sharedTitle.toUpperCase())).status()).toBe(200)
    expect(await existsInA(twinA.id)).toBe(false)

    // Everything else survived: the published event and the whole of org B.
    expect(await existsInA(publishedA.id)).toBe(true)
    expect(await existsInB(twinB.id)).toBe(true)
    expect(await existsInB(otherB.id)).toBe(true)
  } finally {
    // Teardown: archive then delete the published event, then drop org B (twin and other event with it).
    await orgAdmin.page.request.patch(`/api/admin/events/${publishedA.id}`, { data: { publicStatus: "archived" } })
    await del(publishedA.id, publishedA.title)
    await superAdmin.page.request.patch(`/api/super-admin/organizations/${orgB.id}`, { data: { active: false } })
    await superAdmin.page.request.delete(`/api/super-admin/organizations/${orgB.id}`, { data: { confirmSlug: orgB.slug } })
    await superAdmin.context.close()
    await orgAdmin.context.close()
  }
})

test("archive then delete an event from the admin UI", async ({ browser }) => {
  const { context, page } = await login(browser, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD)
  const title = `E2E UI Delete ${Date.now()}`
  const created = await page.request.post("/api/admin/events", {
    data: { title, startDate: "2030-07-01", endDate: "2030-07-02", publicStatus: "published" },
  })
  const { id } = await created.json()

  await page.goto(`/admin/events/${id}`)
  await expect(page.getByText("Archivez cet événement pour pouvoir le supprimer.")).toBeVisible()
  await expect(page.getByRole("button", { name: /Supprimer l'événement/ })).toHaveCount(0)

  await page.getByRole("button", { name: "Archiver", exact: true }).click()
  await page.getByRole("button", { name: "Confirmer" }).click()
  await page.getByRole("button", { name: /Supprimer l'événement/ }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("Action irréversible")).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused()
  const confirmButton = dialog.getByRole("button", { name: "Supprimer définitivement" })
  await expect(confirmButton).toHaveAttribute("aria-disabled", "true")

  await dialog.getByLabel(/Pour confirmer/).fill(title.toLowerCase())
  await expect(confirmButton).toHaveAttribute("aria-disabled", "false")
  await confirmButton.click()

  await expect(page).toHaveURL(/\/admin\/events(\?|$)/)
  await expect(page.getByRole("status").filter({ hasText: "Événement supprimé." })).toBeVisible()
  expect((await page.request.get(`/api/admin/events/${id}`)).status()).toBe(404)
  await context.close()
})
