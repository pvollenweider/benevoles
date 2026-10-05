import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"

/**
 * « Jour J » (#561): the day-of page of an event running today, reached from the event page.
 * One tap on « Présent » goes through the registrations list's check-in (same route, same log
 * entry); the page is checked with axe and for horizontal scrolling at 320 px.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
// The e2e organization has no zone of its own: the deployment default.
const TIME_ZONE = "Europe/Zurich"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

/** An event today with one shift running all day, two confirmed people and one on the waitlist. */
async function eventRunningToday(page: Page, stamp: number) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE })
  const event = await (await page.request.post("/api/admin/events", {
    data: { title: `E2E Jour J ${stamp}`, startDate: today, endDate: today, publicStatus: "draft" },
  })).json()
  const shiftRes = await page.request.post("/api/admin/shifts", {
    data: {
      eventId: event.id, roleName: "Buvette", label: "Buvette", date: today, startTime: "00:00", endTime: "23:59", capacity: 3,
      contactName: "Paul Chef", contactPhone: "079 000 00 00",
    },
  })
  expect(shiftRes.ok(), await shiftRes.text()).toBeTruthy()
  const shift = await shiftRes.json()
  const ids: string[] = []
  for (const [i, [firstName, lastName, phone]] of [["Zoé", `Müller${stamp}`, "+41 79 123 45 67"], ["Léon", `Favre${stamp}`, ""]].entries()) {
    const res = await page.request.post("/api/admin/registrations", {
      data: { eventId: event.id, shiftId: shift.id, firstName, lastName, email: `e2e-dayof-${stamp}-${i}@example.com`, phone },
    })
    expect(res.ok(), await res.text()).toBeTruthy()
    ids.push((await res.json()).id)
  }
  return { eventId: event.id as string, registrationIds: ids }
}

test("the event page leads to « Jour J », where one tap marks a person present, like the registrations list", async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const stamp = Date.now()
  const { eventId, registrationIds } = await eventRunningToday(page, stamp)

  await page.goto(`/admin/events/${eventId}`)
  await expect(page.getByRole("heading", { name: "C'est le jour J" })).toBeVisible()
  await page.getByRole("link", { name: "Ouvrir le jour J" }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/day-of$`))
  await expect(page.getByRole("heading", { level: 1, name: "Jour J" })).toBeVisible()

  const now = page.getByRole("region", { name: "En cours" })
  await expect(now.getByRole("heading", { level: 3, name: "Depuis 0h" })).toBeVisible()
  await expect(now.getByRole("heading", { level: 4, name: "Buvette" })).toBeVisible()
  await expect(now.getByText("0 présent sur 2 attendus.")).toBeVisible()
  await expect(now.getByText("Il manque 1 personne.")).toBeVisible()
  await expect(now.getByRole("link", { name: `Appeler Zoé Müller${stamp} au +41 79 123 45 67` })).toHaveAttribute("href", "tel:+41791234567")
  await expect(now.getByRole("link", { name: "Appeler Paul Chef, contact du créneau, au 079 000 00 00" })).toHaveAttribute("href", "tel:0790000000")

  const present = page.getByRole("button", { name: `Marquer présent, Zoé Müller${stamp}` })
  await waitForHydration(present)
  const startedAt = new Date().toISOString()
  await present.focus()
  await page.keyboard.press("Enter")
  const undo = page.getByRole("button", { name: `Annuler la présence, Zoé Müller${stamp}` })
  await expect(undo).toBeFocused()
  await expect(page.getByRole("status")).toHaveText(`Présence enregistrée pour Zoé Müller${stamp}. Buvette : 1 présent sur 2 attendus.`)
  await expect(now.getByText("1 présent sur 2 attendus.")).toBeVisible()

  // Same data and same log entry as « Marquer présents » on the registrations list (#399).
  const detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  const regs = detail.shifts[0].registrations as { id: string; checkedInAt: string | null }[]
  expect(regs.find((r) => r.id === registrationIds[0])?.checkedInAt).toBeTruthy()
  expect(regs.find((r) => r.id === registrationIds[1])?.checkedInAt).toBeNull()
  const log = await (await page.request.get(`/api/admin/events/${eventId}/log?action=registration.checked_in&since=${encodeURIComponent(startedAt)}`)).json()
  expect(log.entries.map((e: { entityId: string }) => e.entityId)).toEqual([registrationIds[0]])

  await page.goto(`/admin/events/${eventId}/registrations`)
  await expect(page.getByText("1 présent", { exact: true })).toBeVisible()

  // Search, accents aside.
  await page.goto(`/admin/events/${eventId}/day-of`)
  const search = page.getByLabel("Rechercher un bénévole ou un poste")
  await waitForHydration(search)
  await search.fill("leon")
  await expect(page.getByRole("button", { name: `Marquer présent, Léon Favre${stamp}` })).toBeVisible()
  await expect(page.getByRole("button", { name: new RegExp(`Zoé Müller${stamp}`) })).toHaveCount(0)
  await expect(page.getByRole("status")).toHaveText("1 créneau, 1 personne affichée.")
})

test.describe("on a 320 px phone", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("« Jour J » fits without horizontal scrolling and has no serious violation", async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const stamp = Date.now()
    const { eventId } = await eventRunningToday(page, stamp)
    await page.goto(`/admin/events/${eventId}/day-of`)
    const present = page.getByRole("button", { name: `Marquer présent, Zoé Müller${stamp}` })
    await waitForHydration(present)
    await present.click()
    await expect(page.getByRole("button", { name: `Annuler la présence, Zoé Müller${stamp}` })).toBeVisible()

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    // Touch targets of at least 44 px (WCAG 2.5.5 level AAA, our target for this page).
    const small = await page.locator("main button, main a[href^='tel:'], main summary, main input").evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 80)))
    expect(small).toEqual([])
    expect.soft(await seriousViolations(page), "day-of at 320 px").toEqual([])
  })
})
