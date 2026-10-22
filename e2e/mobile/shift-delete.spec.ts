import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "../helpers/hydration"

/**
 * Deleting a shift by touch (#987), on the WebKit engine with iPhone emulation (project
 * "webkit-iphone"). WebKit does not focus a tapped button: focus fell back to the admin's
 * `<main tabIndex={-1}>`, the Frise popover took that for focus leaving it and closed before the
 * tap's click, so « Supprimer le créneau » did nothing. In « Liste », the actions column was cut
 * off at the right edge of a phone screen. A capacity typed just before tapping « Voir les
 * inscriptions » is saved before the page changes (#991), and places saved on close are still
 * shown after another admin page and Back (#1004).
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function logIn(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).tap()
  await expect(page).toHaveURL(/\/admin\/events/)
}

async function createEvent(page: Page, title: string, shifts: { roleName: string; label?: string; date?: string; startTime: string; endTime: string }[]) {
  const eventRes = await page.request.post("/api/admin/events", {
    data: { title, startDate: "2030-10-02", endDate: "2030-10-05", publicStatus: "draft" },
  })
  expect(eventRes.ok()).toBeTruthy()
  const event: { id: string } = await eventRes.json()
  const ids: string[] = []
  for (const s of shifts) {
    const res = await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, label: s.label ?? s.roleName, date: "2030-10-05", capacity: 3, ...s },
    })
    expect(res.ok()).toBeTruthy()
    ids.push(((await res.json()) as { id: string }).id)
  }
  return { eventId: event.id, shiftIds: ids }
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await page.setViewportSize({ width: 390, height: 844 })
  await logIn(page)
})

test("Frise: tapping « Supprimer le créneau » asks, then deletes the shift for good", async ({ page }) => {
  const { eventId, shiftIds: [barId, otherId] } = await createEvent(page, `E2E Suppression frise ${Date.now()}`, [
    { roleName: "Bar", startTime: "10:00", endTime: "12:00" },
    { roleName: "Bar", startTime: "14:00", endTime: "16:00" },
  ])
  await page.goto(`/admin/events/${eventId}/shifts`)
  const frise = page.getByRole("button", { name: "Frise" })
  await waitForHydration(frise)
  await expect(frise).toHaveAttribute("aria-pressed", "true")

  const bar = page.locator(`#shift-bar-${barId}`)
  await bar.tap()
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByRole("button", { name: "Supprimer le créneau" }).tap()

  const confirm = page.getByRole("alertdialog", { name: "Supprimer le créneau « Bar » ?" })
  await expect(confirm).toBeVisible()
  await expect(popover).toHaveCount(0)

  // Cancel gives focus back to the bar, and nothing is deleted.
  await confirm.getByRole("button", { name: "Annuler" }).tap()
  await expect(confirm).toHaveCount(0)
  await expect(bar).toBeFocused()

  // Nothing but the DELETE goes out: closing for the confirmation does not save over the shift.
  const sent: string[] = []
  page.on("request", r => { if (r.url().includes("/api/admin/shifts/")) sent.push(r.method()) })
  await bar.tap()
  await popover.getByRole("button", { name: "Supprimer le créneau" }).tap()
  await confirm.getByRole("button", { name: "Supprimer" }).tap()
  await expect(confirm).toHaveCount(0)
  await expect(bar).toHaveCount(0)
  expect(sent).toEqual(["DELETE"])
  // Focus lands on the next shift of the role.
  await expect(page.locator(`#shift-bar-${otherId}`)).toBeFocused()

  await page.reload()
  await waitForHydration(page.getByRole("button", { name: "Frise" }))
  await expect(page.locator(`#shift-bar-${otherId}`)).toBeVisible()
  await expect(page.locator(`#shift-bar-${barId}`)).toHaveCount(0)
})

test("Frise: after a tapped button, Escape still closes the popover and gives focus back to the bar", async ({ page }) => {
  const { eventId, shiftIds: [barId] } = await createEvent(page, `E2E Echap frise ${Date.now()}`, [
    { roleName: "Bar", startTime: "10:00", endTime: "12:00" },
  ])
  await page.goto(`/admin/events/${eventId}/shifts`)
  await waitForHydration(page.getByRole("button", { name: "Frise" }))
  const bar = page.locator(`#shift-bar-${barId}`)
  await bar.tap()
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByRole("button", { name: "Dupliquer" }).tap()
  // The popover stays open after a tap on one of its buttons (it closed on pointer down before).
  await expect(popover.getByRole("status")).toHaveText("Créneau dupliqué juste après celui-ci.")
  await page.keyboard.press("Escape")
  await expect(popover).toHaveCount(0)
  await expect(bar).toBeFocused()
})

test("Frise: a capacity typed before tapping « Voir les inscriptions » is saved (#991)", async ({ page }) => {
  const { eventId, shiftIds: [barId] } = await createEvent(page, `E2E Places avant inscriptions ${Date.now()}`, [
    { roleName: "Bar", startTime: "10:00", endTime: "12:00" },
  ])
  const shifts = `/admin/events/${eventId}/shifts`
  await page.goto(shifts)
  await waitForHydration(page.getByRole("button", { name: "Frise" }))
  const bar = page.locator(`#shift-bar-${barId}`)
  await bar.tap()
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByLabel("Places").fill("7")
  const sent: string[] = []
  page.on("request", r => { if (r.url().includes(`/api/admin/shifts/${barId}`)) sent.push(r.method()) })
  await popover.getByRole("link", { name: "Voir les inscriptions" }).tap()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/registrations\\?shift=${barId}$`))
  // One save, the same as closing, and only then the registrations page.
  expect(sent).toEqual(["PATCH"])

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`${shifts}$`))
  await waitForHydration(page.getByRole("button", { name: "Frise" }))
  await expect(bar).toContainText("0/7")
  await bar.tap()
  await expect(popover.getByLabel("Places")).toHaveValue("7")
})

test("Frise: places saved on close are still shown after an admin link and Back (#1004)", async ({ page }) => {
  const { eventId, shiftIds: [barId] } = await createEvent(page, `E2E Places Retour ${Date.now()}`, [
    { roleName: "Bar", startTime: "10:00", endTime: "12:00" },
  ])
  const shifts = `/admin/events/${eventId}/shifts`
  await page.goto(shifts)
  await waitForHydration(page.getByRole("button", { name: "Frise" }))
  const bar = page.locator(`#shift-bar-${barId}`)
  await bar.tap()
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByLabel("Places").fill("7")
  // Closing saves.
  const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes(`/api/admin/shifts/${barId}`))
  await popover.getByRole("button", { name: /^Fermer/ }).tap()
  expect((await saved).ok()).toBeTruthy()
  await expect(popover).toBeHidden()
  await expect(bar).toContainText("0/7")

  const tabs = page.getByRole("navigation", { name: "Sections de l'événement" })
  await tabs.getByRole("link", { name: "Inscriptions" }).tap()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${eventId}/registrations$`))
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`${shifts}$`))
  await waitForHydration(page.getByRole("button", { name: "Frise" }))
  await expect(bar).toContainText("0/7")
  await bar.tap()
  await expect(popover.getByLabel("Places")).toHaveValue("7")
})

for (const width of [320, 390]) {
  test(`Liste at ${width} px: « Supprimer » is on screen, asks, then deletes the shift for good`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const { eventId } = await createEvent(page, `E2E Suppression liste ${width} ${Date.now()}`, [
      // A long role name and the longest French date: the widest row a phone has to show.
      { roleName: "Accueil des artistes et logistique", label: "Accueil des artistes", date: "2030-10-02", startTime: "08:00", endTime: "09:30" },
      { roleName: "Bar", startTime: "10:00", endTime: "12:00" },
    ])
    await page.goto(`/admin/events/${eventId}/shifts`)
    const liste = page.getByRole("button", { name: "Liste" })
    await waitForHydration(liste)
    await liste.tap()

    const rows = page.getByRole("row")
    await expect(rows).toHaveCount(3)
    for (const name of [/^Modifier le créneau Accueil des artistes et logistique/, /^Supprimer le créneau Accueil des artistes et logistique/]) {
      const box = await page.getByRole("button", { name }).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(box!.height).toBeGreaterThanOrEqual(24)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    // At the default text size, the table fits: its scroll region has nothing to scroll.
    const region = page.getByRole("region", { name: "Liste des créneaux" })
    expect(await region.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)

    const del = page.getByRole("button", { name: /^Supprimer le créneau Bar, samedi 5 octobre/ })
    await del.tap()
    const confirm = page.getByRole("alertdialog", { name: "Supprimer le créneau « Bar » ?" })
    await expect(confirm).toBeVisible()
    await confirm.getByRole("button", { name: "Annuler" }).tap()
    await expect(confirm).toHaveCount(0)
    await expect(del).toBeFocused()

    await del.tap()
    await confirm.getByRole("button", { name: "Supprimer" }).tap()
    await expect(confirm).toHaveCount(0)
    await expect(del).toHaveCount(0)
    await expect(page.getByRole("status").filter({ hasText: "Créneau supprimé." })).toBeFocused()

    await page.reload()
    await waitForHydration(page.getByRole("button", { name: "Liste" }))
    await page.getByRole("button", { name: "Liste" }).tap()
    await expect(page.getByRole("button", { name: /^Supprimer le créneau Accueil des artistes/ })).toBeVisible()
    await expect(page.getByRole("button", { name: /^Supprimer le créneau Bar/ })).toHaveCount(0)

    // Text twice as large: the table scrolls in its own region, which stays within the screen,
    // and the last « Supprimer » can still be brought on screen (1.4.4).
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%" })
    const remaining = page.getByRole("button", { name: /^Supprimer le créneau Accueil des artistes/ })
    await remaining.scrollIntoViewIfNeeded()
    const box = await remaining.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    // The region itself stays within the screen: its table does not widen the page.
    const regionBox = await page.getByRole("region", { name: "Liste des créneaux" }).boundingBox()
    expect(regionBox!.x + regionBox!.width).toBeLessThanOrEqual(width)
  })
}
