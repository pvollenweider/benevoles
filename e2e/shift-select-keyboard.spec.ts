import { test, expect, type Locator, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"

/**
 * The shift picker of the registrations page with the keyboard alone (#555): a select-only
 * combobox in the manual add form and in the shift filter, checked by axe with its list open.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

/**
 * An event with a « Bar » shift in the morning and an « Accueil » one in the afternoon, one person
 * on Accueil; with `overlap`, also a « Vestiaire » shift with a long label overlapping Accueil.
 */
async function setUpEvent(page: Page, stamp: number, { overlap = false } = {}) {
  const event: { id: string } = await (await page.request.post("/api/admin/events", {
    data: { title: `E2E Shift Select ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })).json()
  const bar: { id: string } = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 3 },
  })).json()
  const accueil: { id: string } = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 3 },
  })).json()
  await page.request.post("/api/admin/registrations", {
    data: { eventId: event.id, shiftId: accueil.id, firstName: "E2E", lastName: "Accueil", email: `e2e-shift-select-${stamp}@example.com` },
  })
  if (overlap) {
    const res = await page.request.post("/api/admin/shifts", {
      data: { eventId: event.id, roleName: "Vestiaire", label: "Vestiaire des artistes, entrée nord", date: "2030-10-01", startTime: "15:00", endTime: "17:00", capacity: 3 },
    })
    expect(res.ok()).toBe(true)
  }
  return { eventId: event.id, barId: bar.id }
}

test("a shift is chosen with the keyboard in the manual add form", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId, barId } = await setUpEvent(page, stamp)
  await page.goto(`/admin/events/${eventId}/registrations`)

  const open = page.getByRole("button", { name: "+ Ajouter manuellement" })
  await open.click()
  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill("E2E")
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill(`Clavier${stamp}`)

  const combo = page.getByRole("combobox", { name: "Créneau", exact: true })
  await combo.focus()
  await page.keyboard.press("ArrowDown")
  await expect(combo).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("listbox", { name: "Créneau", exact: true })).toBeVisible()
  // axe with the list open: the listbox, its options and the active descendant.
  expect.soft(await seriousViolations(page)).toEqual([])

  await page.keyboard.press("Enter")
  await expect(combo).toHaveAttribute("aria-expanded", "false")
  await expect(combo).toContainText("Bar")
  await expect(combo).toBeFocused()

  await page.getByRole("button", { name: "Ajouter", exact: true }).click()
  await expect(open).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: `Inscription de E2E Clavier${stamp} ajoutée : Bar` })).toBeVisible()

  const detail = await (await page.request.get(`/api/admin/events/${eventId}`)).json()
  const shift = detail.shifts.find((s: { id: string }) => s.id === barId)
  expect(shift.registrations).toHaveLength(1)
})

test("the shift filter is named and works with the keyboard", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEvent(page, stamp)
  await page.goto(`/admin/events/${eventId}/registrations`)
  // The count is on the page for reading, not in a live region: it is spoken after a filter change.
  await expect(page.getByText("1 inscription affichée", { exact: true })).toBeAttached()
  await expect(page.getByRole("status").filter({ hasText: "inscription" })).toHaveCount(0)

  const filter = page.getByRole("combobox", { name: "Filtrer par créneau" })
  await filter.focus()
  await page.keyboard.press("b")
  await expect(page.getByRole("listbox", { name: "Filtrer par créneau" })).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])
  await page.keyboard.press("Enter")

  await expect(filter).toContainText("Bar")
  await expect(page.getByText("Aucun résultat.")).toBeVisible()
  // The region holds the count alone, nothing next to it.
  await expect(page.getByRole("status")).toHaveText("0 inscription affichée")

  await page.keyboard.press("Home")
  await page.keyboard.press("Enter")
  await expect(filter).toContainText("Tous les créneaux")
  await expect(page.getByRole("status")).toHaveText("1 inscription affichée")
})

/** The open list fits the 320 px screen: no page scroll sideways, no option cut, axe clean. */
async function expectListFits(page: Page, list: Locator) {
  await expect(list).toBeVisible()
  const box = await list.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const cut = await list.getByRole("option").evaluateAll((options) => options.filter((o) => o.scrollWidth > o.clientWidth).map((o) => o.getAttribute("aria-label") ?? o.textContent))
  expect(cut).toEqual([])
  expect.soft(await seriousViolations(page)).toEqual([])
}

/** A warning badge of an option is whole: inside its option, inside the screen, not cut. */
async function expectBadgeWhole(list: Locator, name: RegExp, text: string) {
  const option = list.getByRole("option", { name })
  await expect(option).toHaveCount(1)
  const badge = option.getByText(text, { exact: true })
  await badge.scrollIntoViewIfNeeded()
  // IntersectionObserver: also catches a badge clipped by the list's overflow-hidden.
  await expect(badge).toBeInViewport({ ratio: 1 })
  const o = (await option.boundingBox())!
  const b = (await badge.boundingBox())!
  expect(b.x).toBeGreaterThanOrEqual(o.x)
  expect(b.x + b.width).toBeLessThanOrEqual(Math.min(o.x + o.width, 320) + 0.5)
  expect(await badge.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
}

const noPageScrollX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

// #574: at 320 px (400% zoom of a 1280 px window), both pickers reflow (WCAG 1.4.10).
test("both shift pickers fit a 320 px wide screen", async ({ page }) => {
  await login(page)
  const stamp = Date.now()
  const { eventId } = await setUpEvent(page, stamp, { overlap: true })
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(`/admin/events/${eventId}/registrations`)

  const filter = page.getByRole("combobox", { name: "Filtrer par créneau" })
  await filter.focus()
  await page.keyboard.press("ArrowDown")
  const filterList = page.getByRole("listbox", { name: "Filtrer par créneau" })
  await expectListFits(page, filterList)
  const pill = filterList.getByText("1/3", { exact: true })
  await pill.scrollIntoViewIfNeeded()
  await expect(pill).toBeInViewport({ ratio: 1 })
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "+ Ajouter manuellement" }).click()
  // The person already holds Accueil (« Déjà inscrit »), which Vestiaire overlaps (« ⚠ conflit »).
  await page.getByLabel("Email", { exact: true }).fill(`e2e-shift-select-${stamp}@example.com`)
  const combo = page.getByRole("combobox", { name: "Créneau", exact: true })
  await combo.focus()
  await page.keyboard.press("ArrowDown")
  const list = page.getByRole("listbox", { name: "Créneau", exact: true })
  await expectListFits(page, list)
  await expectBadgeWhole(list, /conflit d'horaire/, "⚠ conflit")
  await expectBadgeWhole(list, /déjà inscrit/, "Déjà inscrit")
  await expect(list.getByText("Vestiaire des artistes, entrée nord", { exact: false })).toBeInViewport({ ratio: 1 })

  // The conflicting shift: its warning fits, describes the field and does not make it invalid.
  await page.keyboard.press("v")
  await page.keyboard.press("Enter")
  await expect(combo).toContainText("Vestiaire des artistes, entrée nord")
  const warn = page.locator("#add-shift-conflict")
  await expect(warn).toHaveText("Ce bénévole est déjà inscrit à un autre créneau pour cette plage horaire.")
  await warn.scrollIntoViewIfNeeded()
  await expect(warn).toBeInViewport({ ratio: 1 })
  expect(await warn.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  await expect(combo).toHaveAttribute("aria-describedby", /add-shift-conflict/)
  await expect(combo).not.toHaveAttribute("aria-invalid")
  // The long chosen value wraps inside the trigger instead of being cut.
  const trigger = (await combo.boundingBox())!
  expect(trigger.x + trigger.width).toBeLessThanOrEqual(320)
  expect(await combo.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await noPageScrollX(page)).toBe(true)

  // Type-ahead to Accueil: the value still fits, with no page scroll sideways.
  await page.keyboard.press("a")
  await page.keyboard.press("Enter")
  await expect(combo).toContainText("Accueil")
  expect(await combo.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(await noPageScrollX(page)).toBe(true)
})
