import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * « Avant ta mission » and the day-of contact (#560): the personal page opens on the next
 * confirmed shift with the event's place, instructions and information pages as fallbacks, the
 * day-of contact for a shift without one (with the emergency note), and the shift's own contact
 * elsewhere; real headings, named tel: links, 320 px. The day-of contact never reaches the public
 * page, the public API or the page metadata; the event form saves it.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const DATE = "2030-10-01"
const NAME = "Coordination Marc"
const PHONE = "079 111 22 33"
const LEADER = "Paul Responsable"
const LEADER_EMAIL = `e2e-leader-${Date.now()}@example.com`
const EMERGENCY = "En cas d'urgence, appelle les numéros d'urgence officiels : ce contact ne les remplace pas."

let event: PublicEvent

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await browser.newPage()
  await login(page)
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const created = await post("/api/admin/events", {
    title: `E2E Avant ta mission ${Date.now()}`, startDate: DATE, endDate: DATE,
    location: "Salle communale", latitude: 46.2, longitude: 6.1, publicInstructions: "Entrée par la cour",
    dayContactName: NAME, dayContactPhone: PHONE,
  })
  // Bar first, without a contact: the day-of contact; Accueil later, with its own contact.
  const bar = await post("/api/admin/shifts", { eventId: created.id, roleName: "Bar", label: "Bar", date: DATE, startTime: "10:00", endTime: "12:00", capacity: 5 })
  const accueil = await post("/api/admin/shifts", {
    eventId: created.id, roleName: "Accueil", label: "Accueil", date: DATE, startTime: "14:00", endTime: "16:00", capacity: 5,
    contactName: "Léa", contactPhone: "079 000 00 00",
  })
  await post(`/api/admin/events/${created.id}/pages`, { title: "Accès", content: "Bus 12, arrêt Église." })
  // A sector leader of Bar (#560): named to its confirmed volunteers, never their email.
  await post(`/api/admin/events/${created.id}/sector-leaders`, { roleName: "Bar", name: LEADER, email: LEADER_EMAIL })
  const publish = await page.request.patch(`/api/admin/events/${created.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()
  await page.close()
  event = { eventId: created.id, slug: created.slug, date: DATE, shifts: [{ id: bar.id, label: "Bar" }, { id: accueil.id, label: "Accueil" }] }
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

async function openMyPage(page: Page) {
  const token = await publicSignUp(page, event, event.shifts.map((s) => s.id))
  await page.goto(`/my/${token}`)
  const brief = page.getByRole("region", { name: "Avant ta mission" })
  await expect(brief).toBeVisible()
  await waitForHydration(page.getByRole("button", { name: "Annuler le créneau Bar" }))
  return brief
}

test("the next shift with the event's place, instructions and pages, and the day-of contact", async ({ page }) => {
  const brief = await openMyPage(page)
  await expect(brief.getByRole("heading", { level: 2, name: "Avant ta mission" })).toBeVisible()
  await expect(brief.getByText("Bar", { exact: true })).toBeVisible()
  await expect(brief.getByRole("term")).toHaveText(["Quand", "Lieu", "Contact le jour J", "Responsable du poste", "À savoir"])
  await expect(brief.getByText(LEADER)).toBeVisible()
  expect(await page.content()).not.toContain(LEADER_EMAIL)
  await expect(brief.getByText(/mardi 1 octobre, 10:00/)).toBeVisible()
  await expect(brief.getByText("Salle communale")).toBeVisible()
  await expect(brief.getByRole("link", { name: /^Voir sur la carte/ })).toHaveAttribute("href", /openstreetmap\.org\/\?mlat=46\.2&mlon=6\.1/)
  await expect(brief.getByRole("link", { name: `${PHONE}, appeler ${NAME}` })).toHaveAttribute("href", "tel:0791112233")
  await expect(brief.getByText(EMERGENCY)).toBeVisible()
  await expect(brief.getByText("Entrée par la cour")).toBeVisible()
  await expect(brief.getByRole("heading", { level: 3, name: "Infos de l'événement" })).toBeVisible()
  await expect(brief.getByRole("link", { name: "Accès" })).toHaveAttribute("href", new RegExp(`/${event.slug}/acces$`))

  // The other shift's card: its own contact, under its own label, and no day-of contact.
  const accueil = page.locator("[id^='registration-']").filter({ hasText: "Accueil" })
  await expect(accueil.getByRole("term").filter({ hasText: "Contact pour ce créneau" })).toBeVisible()
  await expect(accueil.getByRole("link", { name: "079 000 00 00, appeler Léa" })).toHaveAttribute("href", "tel:0790000000")
  await expect(accueil.getByText(LEADER)).toHaveCount(0)
  await expect(accueil.getByText(PHONE)).toHaveCount(0)
  // The next shift's card points to the block instead of repeating it.
  await expect(page.getByRole("heading", { level: 2, name: "Tous mes créneaux" })).toBeVisible()
  const toBrief = page.locator("[id^='registration-']").filter({ hasText: "Bar" }).getByRole("link", { name: "voir « Avant ta mission »" })
  await expect(toBrief).toHaveAttribute("href", "#avant-ta-mission")

  expect(await seriousViolations(page)).toEqual([])
})

test("the day-of contact never reaches the public page, the public API or the metadata", async ({ page }) => {
  const previewer = { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }
  for (const url of [`/api/public/${event.slug}?org=default`, "/api/public/events?org=default", `/${event.slug}?org=default`]) {
    const res = await page.request.get(url, { headers: previewer })
    expect(res.ok(), url).toBeTruthy()
    const body = await res.text()
    expect(body, url).not.toContain(PHONE)
    expect(body, url).not.toContain(NAME)
    expect(body, url).not.toContain(LEADER)
  }
  // The public page as a visitor sees it, hydrated.
  await page.goto(`/${event.slug}?org=default`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByText(PHONE)).toHaveCount(0)
  expect(await page.content()).not.toContain(PHONE)
})

test.describe("at 320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("the block fits: no horizontal scroll, its links whole in the viewport", async ({ page }) => {
    const brief = await openMyPage(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    for (const link of await brief.getByRole("link").all()) {
      await link.scrollIntoViewIfNeeded()
      const box = await link.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(320)
    }
  })
})

test("the event form saves the day-of contact", async ({ page }) => {
  await login(page)
  await page.goto(`/admin/events/${event.eventId}/edit`)
  const group = page.getByRole("group", { name: "Contact le jour J" })
  const phone = group.getByLabel("Téléphone")
  await waitForHydration(phone)
  await expect(group.getByLabel("Nom")).toHaveValue(NAME)
  await expect(phone).toHaveValue(PHONE)
  await expect(group).toHaveAccessibleDescription(/Visible uniquement par les bénévoles confirmés/)
  await expect(phone).toHaveAccessibleDescription(/Visible uniquement par les bénévoles confirmés/)

  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/admin/events/${event.eventId}`) && r.request().method() === "PATCH" && r.ok())
  await phone.fill("079 444 55 66")
  await saved
  await page.reload()
  await expect(page.getByRole("group", { name: "Contact le jour J" }).getByLabel("Téléphone")).toHaveValue("079 444 55 66")
  // Put the original number back for the other tests of this file.
  const restored = page.waitForResponse((r) => r.url().endsWith(`/api/admin/events/${event.eventId}`) && r.request().method() === "PATCH" && r.ok())
  const again = page.getByRole("group", { name: "Contact le jour J" }).getByLabel("Téléphone")
  await waitForHydration(again)
  await again.fill(PHONE)
  await restored
})
