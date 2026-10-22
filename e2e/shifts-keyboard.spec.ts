import { test, expect, type Page } from "@playwright/test"

/**
 * The shifts page with the keyboard alone (#554): the shift editor takes focus when it opens, a
 * missing field is reached by focus and says its error, and focus comes back to the opener (or to
 * « + Ajouter un créneau » when the opener is gone) after « Annuler » or a save, never to <body>.
 * In « Gérer les postes », focus returns to the row button after a rename or a colour, and to
 * « Gérer les postes » when the panel closes; every `aria-controls` points to an element that exists.
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

/** A one-day event with a « Bar » and an « Accueil » shift (plus `extraRoles`), opened on its shifts page. */
async function openShiftsPage(page: Page, extraRoles: string[] = [], reserved: Record<string, string[]> = {}) {
  await login(page)
  const stamp = Date.now()
  const post = async (url: string, data: unknown) => {
    const res = await page.request.post(url, { data })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event: { id: string } = await post("/api/admin/events", { title: `E2E Shifts Keyboard ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 3 })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 3 })
  for (const role of extraRoles) {
    await post("/api/admin/shifts", { eventId: event.id, roleName: role, label: role, date: "2030-10-01", startTime: "17:00", endTime: "18:00", capacity: 3 })
  }
  for (const [role, reservedTags] of Object.entries(reserved)) {
    const res = await page.request.patch(`/api/admin/events/${event.id}/roles/${encodeURIComponent(role)}`, { data: { reservedTags } })
    expect(res.ok(), `reserve ${role}: ${res.status()} ${await res.text()}`).toBeTruthy()
  }
  await page.goto(`/admin/events/${event.id}/shifts`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
}

const focusIsNotOnBody = (page: Page) => page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)

test("a shift is added with the keyboard: errors reached by focus, focus back on the add button, one announcement", async ({ page }) => {
  await openShiftsPage(page)
  const add = page.getByRole("button", { name: "+ Ajouter un créneau" })
  await add.focus()
  await page.keyboard.press("Enter")

  const editor = page.getByRole("group", { name: "Nouveau créneau" })
  await expect(editor).toBeVisible()
  const role = editor.getByRole("combobox", { name: "Poste", exact: true })
  await expect(role).toBeFocused()

  // Empty submit: focus lands on the first invalid field, which says its error; no alert.
  await editor.getByRole("button", { name: "Ajouter", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(role).toBeFocused()
  await expect(role).toHaveAttribute("aria-invalid", "true")
  await expect(role).toHaveAccessibleDescription(/Indiquez le poste\./)
  await expect(editor.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0)

  await role.fill("Buvette")
  await expect(role).not.toHaveAttribute("aria-invalid")
  await editor.getByRole("textbox", { name: "Début", exact: true }).fill("17:00")
  await expect(editor.getByRole("textbox", { name: "Fin", exact: true })).toHaveValue("18:00")
  await editor.getByRole("button", { name: "Ajouter", exact: true }).focus()
  await page.keyboard.press("Enter")

  await expect(editor).toBeHidden()
  await expect(add).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: "Créneau ajouté" })).toHaveCount(1)
  await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(1)
  await expect(page.getByRole("status").filter({ hasText: "Créneau ajouté" })).toHaveText(/^Créneau ajouté : Buvette, mardi 1 octobre, de 17h à 18h\.$/)
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0)
})

test("« Annuler » returns focus to « + Ajouter un créneau »", async ({ page }) => {
  await openShiftsPage(page)
  const add = page.getByRole("button", { name: "+ Ajouter un créneau" })
  await add.focus()
  await page.keyboard.press("Enter")
  const editor = page.getByRole("group", { name: "Nouveau créneau" })
  await expect(editor.getByRole("combobox", { name: "Poste", exact: true })).toBeFocused()
  await editor.getByRole("button", { name: "Annuler" }).focus()
  await page.keyboard.press("Enter")
  await expect(editor).toBeHidden()
  await expect(add).toBeFocused()
})

test("after editing a shift from the list, focus is back on that row's « Modifier »", async ({ page }) => {
  await openShiftsPage(page)
  await page.getByRole("button", { name: "Liste", exact: true }).click()
  // Named with its shift (#587), starting with the visible « Modifier ».
  const barEdit = () => page.getByRole("button", { name: /^Modifier le créneau Bar, mardi 1 octobre, de 10h à/ })
  await barEdit().focus()
  await page.keyboard.press("Enter")

  const editor = page.getByRole("group", { name: "Modifier le créneau" })
  await expect(editor.getByRole("combobox", { name: "Poste", exact: true })).toBeFocused()
  await editor.getByRole("textbox", { name: "Fin", exact: true }).fill("13:00")
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).focus()
  await page.keyboard.press("Enter")

  await expect(editor).toBeHidden()
  await expect(barEdit()).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: "Créneau modifié" })).toHaveText(/^Créneau modifié : Bar, mardi 1 octobre, de 10h à 13h\.$/)
  await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(1)
})

test("when the opener is gone (list switched to timeline), focus falls back to « + Ajouter un créneau »", async ({ page }) => {
  await openShiftsPage(page)
  await page.getByRole("button", { name: "Liste", exact: true }).click()
  await page.getByRole("button", { name: /^Modifier le créneau Bar/ }).click()
  const editor = page.getByRole("group", { name: "Modifier le créneau" })
  await expect(editor).toBeVisible()
  await page.getByRole("button", { name: "Frise", exact: true }).click()
  await expect(page.getByRole("table")).toHaveCount(0)
  await editor.getByRole("button", { name: "Annuler" }).focus()
  await page.keyboard.press("Enter")

  await expect(editor).toBeHidden()
  await expect(page.getByRole("button", { name: "+ Ajouter un créneau" })).toBeFocused()
  expect(await focusIsNotOnBody(page)).toBe(true)
})

// ── « Gérer les postes » (#554) ───────────────────────────────────────────────

/** Ids named by `aria-controls` that no element of the page carries. */
const danglingAriaControls = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll("[aria-controls]")]
    .flatMap((el) => (el.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean))
    .filter((id) => !document.getElementById(id)))

async function openRolesPanel(page: Page) {
  const manage = page.getByRole("button", { name: "Gérer les postes" })
  await expect(manage).toHaveAttribute("aria-expanded", "false")
  await manage.focus()
  await page.keyboard.press("Enter")
  await expect(manage).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("heading", { name: "Gérer les postes" })).toBeVisible()
  return manage
}

test("roles panel, rename with the keyboard: Escape and Enter return the focus to « Renommer », the rename is announced once", async ({ page }) => {
  await openShiftsPage(page)
  await openRolesPanel(page)

  await page.getByRole("button", { name: "Renommer le poste Bar" }).focus()
  await page.keyboard.press("Enter")
  const input = page.getByLabel("Nouveau nom du poste « Bar »")
  await expect(input).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(input).toBeHidden()
  await expect(page.getByRole("button", { name: "Renommer le poste Bar" })).toBeFocused()
  expect(await focusIsNotOnBody(page)).toBe(true)

  await page.keyboard.press("Enter")
  await expect(input).toBeFocused()
  await input.fill("Buvette")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("button", { name: "Renommer le poste Buvette" })).toBeFocused()
  expect(await focusIsNotOnBody(page)).toBe(true)
  await expect(page.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(1)
  await expect(page.getByRole("status").filter({ hasText: "renommé" })).toHaveText(/^Poste « Bar » renommé en « Buvette »\.$/)
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0)
})

test("roles panel, a colour picked with the keyboard: focus is back on the role's colour button", async ({ page }) => {
  await openShiftsPage(page)
  await openRolesPanel(page)
  const color = page.getByRole("button", { name: "Changer la couleur du poste Bar" })
  await color.focus()
  await page.keyboard.press("Enter")
  const picker = page.getByRole("group", { name: "Couleur du poste « Bar »" })
  await expect(picker).toBeVisible()
  expect(await danglingAriaControls(page)).toEqual([])

  await picker.getByRole("button", { name: "Émeraude" }).focus()
  await page.keyboard.press("Enter")
  await expect(picker).toBeHidden()
  await expect(color).toBeFocused()
  expect(await focusIsNotOnBody(page)).toBe(true)
  await expect(page.getByRole("status").filter({ hasText: "Couleur du poste « Bar » : Émeraude." })).toHaveCount(1)
})

test("roles panel, « Fermer »: focus is back on « Gérer les postes »; aria-controls always resolves", async ({ page }) => {
  await openShiftsPage(page)
  expect(await danglingAriaControls(page)).toEqual([])
  const manage = await openRolesPanel(page)
  expect(await danglingAriaControls(page)).toEqual([])

  // A disclosure: Enter on « Gérer les postes » again closes the panel, focus stays on the button.
  await expect(manage).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "Gérer les postes" })).toBeHidden()
  await expect(manage).toBeFocused()
  await expect(manage).toHaveAttribute("aria-expanded", "false")
  expect(await danglingAriaControls(page)).toEqual([])
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "Gérer les postes" })).toBeVisible()

  for (const name of [/^Limite : .*Bar/, /^Accès : .*Bar/]) {
    await page.getByRole("button", { name }).focus()
    await page.keyboard.press("Enter")
    expect(await danglingAriaControls(page)).toEqual([])
  }
  await page.getByRole("button", { name: "Créer une série" }).click()
  expect(await danglingAriaControls(page)).toEqual([])

  await page.getByRole("button", { name: "Fermer", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "Gérer les postes" })).toBeHidden()
  await expect(manage).toBeFocused()
  await expect(manage).toHaveAttribute("aria-expanded", "false")
  expect(await focusIsNotOnBody(page)).toBe(true)
  expect(await danglingAriaControls(page)).toEqual([])

  // Reopened with « Accès » still open: the editor is back, but focus stays on the toggle.
  await page.keyboard.press("Enter")
  await expect(manage).toBeFocused()
  const access = page.getByLabel("Étiquettes donnant accès au poste « Bar »")
  await expect(access).toBeVisible()
  await expect(access).not.toBeFocused()
})

/** The role names in the panel's list, top to bottom. */
const panelOrder = (page: Page) =>
  page.getByRole("list", { name: "Ordre des postes" }).getByRole("listitem")
    .evaluateAll((items) => items.map((li) => li.querySelector("[aria-label^='Renommer le poste ']")?.getAttribute("aria-label")?.replace("Renommer le poste ", "")))

test("roles panel, Monter / Descendre: focus stays on the pressed button, each move announced once, the order saved", async ({ page }) => {
  await openShiftsPage(page, ["Cuisine"])
  await openRolesPanel(page)
  const start = await panelOrder(page)
  expect(start).toHaveLength(3)
  const [first] = start as string[]
  const status = page.getByRole("status").filter({ hasText: /\S/ })

  const down = page.getByRole("button", { name: `Descendre le poste ${first}` })
  await down.focus()
  await page.keyboard.press("Enter")
  await expect(down).toBeFocused()
  expect((await panelOrder(page))[1]).toBe(first)
  await expect(status).toHaveCount(1)
  await expect(status).toHaveText(`${first} déplacé en position 2 sur 3.`)

  await page.keyboard.press("Enter")
  await expect(down).toBeFocused()
  await expect(down).toHaveAttribute("aria-disabled", "true")
  await expect(status).toHaveText(`${first} déplacé en dernière position.`)
  await page.keyboard.press("Enter")
  await expect(down).toBeFocused()
  await expect(status).toHaveText(`${first} est déjà en dernière position.`)
  expect(await focusIsNotOnBody(page)).toBe(true)
  const moved = await panelOrder(page)
  expect(moved[2]).toBe(first)

  const saved = page.waitForResponse((r) => r.url().includes("/reorder-roles") && r.request().method() === "POST")
  await page.getByRole("button", { name: "Enregistrer l'ordre" }).click()
  expect((await saved).ok()).toBe(true)
  await page.reload()
  await openRolesPanel(page)
  expect(await panelOrder(page)).toEqual(moved)
})

test("roles panel at 320 px: rows wrap without horizontal scroll, move buttons at least 24 px and on screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openShiftsPage(page, ["Cuisine"])
  await openRolesPanel(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  const buttons = page.getByRole("button", { name: /^(Monter|Descendre) le poste / })
  await expect(buttons).toHaveCount(6)
  for (const b of await buttons.all()) {
    await b.scrollIntoViewIfNeeded()
    const box = (await b.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(24)
    expect(box.height).toBeGreaterThanOrEqual(24)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  }
})

// #606: a long role name and a long « Accès : … » list are shown whole: they wrap, at 1280 and 320 px.
const LONG_ROLE = "Accueil des artistes et des invités de la soirée de clôture"
const LONG_TAGS = ["sécurité", "secouriste", "logistique"]

for (const width of [1280, 320]) {
  test(`roles panel at ${width} px: a long role name and its « Accès » text are whole, no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openShiftsPage(page, [LONG_ROLE], { [LONG_ROLE]: LONG_TAGS })
    await openRolesPanel(page)
    const list = page.getByRole("list", { name: "Ordre des postes" })
    const name = list.getByText(LONG_ROLE, { exact: true })
    await expect(name).toBeVisible()
    const access = list.getByRole("button", { name: `Accès : ${LONG_TAGS.join(", ")}, poste « ${LONG_ROLE} » réservé` })
    await expect(access).toHaveText(`Accès : ${LONG_TAGS.join(", ")}`)
    for (const [label, el] of [["role name", name], ["Accès", access]] as const) {
      const fit = await el.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth, overflow: getComputedStyle(e).textOverflow }))
      expect(fit.scroll, `${label}: cut (${JSON.stringify(fit)})`).toBeLessThanOrEqual(fit.client)
      expect(fit.overflow, label).not.toBe("ellipsis")
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test("list view: « Modifier » and « Supprimer » are named with their shift, times in words", async ({ page }) => {
  await openShiftsPage(page)
  await page.getByRole("button", { name: "Liste", exact: true }).click()
  await expect(page.getByRole("button", { name: /^Modifier le créneau / })).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Supprimer le créneau Accueil, mardi 1 octobre, de 14h à 16h", exact: true })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Date et horaire" })).toBeVisible()
  await page.getByRole("button", { name: "Supprimer le créneau Bar, mardi 1 octobre, de 10h à 12h", exact: true }).click()
  const confirm = page.getByRole("alertdialog", { name: "Supprimer le créneau « Bar » ?" })
  await expect(confirm).toContainText("Mardi 1 octobre, de 10h à 12h.")
  await confirm.getByRole("button", { name: "Annuler" }).click()
})

// #991: « Voir les inscriptions » saved nothing; the places typed just before were lost.
test("Frise popover, « Voir les inscriptions » with the keyboard: saves the places first, stays put when the save fails", async ({ page }) => {
  await openShiftsPage(page)
  const shiftsUrl = page.url()
  const bar = page.getByRole("button", { name: /^Bar, de 10h à 12h/ })
  await bar.focus()
  await page.keyboard.press("Enter")
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByLabel("Places").fill("6")
  const link = popover.getByRole("link", { name: "Voir les inscriptions" })

  // A failed save: no navigation, the error is shown, focus and the edit stay in the popover.
  await page.route("**/api/admin/shifts/*", route => route.request().method() === "PATCH"
    ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Panne simulée." }) })
    : route.fallback())
  await link.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("Panne simulée.", { exact: true }).first()).toBeVisible()
  await expect(page).toHaveURL(shiftsUrl)
  await expect(link).toBeFocused()
  await expect(link).not.toHaveAttribute("aria-disabled")
  await expect(popover.getByLabel("Places")).toHaveValue("6")

  // Places under the confirmed people would be lost too: focus goes to the field, which says why.
  await page.unroute("**/api/admin/shifts/*")
  await popover.getByLabel("Places").fill("0")
  await link.focus()
  await page.keyboard.press("Enter")
  await expect(popover.getByLabel("Places")).toBeFocused()
  await expect(popover.getByLabel("Places")).toHaveAttribute("aria-invalid", "true")
  await expect(page).toHaveURL(shiftsUrl)

  await popover.getByLabel("Places").fill("6")
  await link.focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/registrations\?shift=/)
  await page.goBack()
  await expect(page).toHaveURL(shiftsUrl)
  await expect(bar).toContainText("0/6")
})

// #1004: a save on close left the page's old copy in the router cache: Back from another admin
// page showed the old places until a reload.
test("Frise popover: places saved on close are still shown after an admin link and Back", async ({ page }) => {
  await openShiftsPage(page)
  const shiftsUrl = page.url()
  const bar = page.getByRole("button", { name: /^Bar, de 10h à 12h/ })
  await bar.focus()
  await page.keyboard.press("Enter")
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByLabel("Places").fill("8")
  const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/api/admin/shifts/"))
  await page.keyboard.press("Escape")
  expect((await saved).ok()).toBeTruthy()
  await expect(popover).toBeHidden()
  await expect(bar).toContainText("0/8")
  // The refresh after the save keeps focus on the bar.
  await expect(bar).toBeFocused()

  const tabs = page.getByRole("navigation", { name: "Sections de l'événement" })
  await tabs.getByRole("link", { name: "Inscriptions" }).click()
  await expect(page).toHaveURL(/\/registrations$/)
  await page.goBack()
  await expect(page).toHaveURL(shiftsUrl)
  await expect(bar).toContainText("0/8")
  await bar.focus()
  await page.keyboard.press("Enter")
  await expect(popover.getByLabel("Places")).toHaveValue("8")
})

// #1004, the same with the admin link clicked while the popover is open: that click closes it and saves.
test("Frise popover: places saved by clicking an admin link are still shown after Back", async ({ page }) => {
  await openShiftsPage(page)
  const shiftsUrl = page.url()
  const bar = page.getByRole("button", { name: /^Bar, de 10h à 12h/ })
  await bar.click()
  const popover = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: /^Bar ?, de 10h à 12h/ }) })
  await popover.getByLabel("Places").fill("9")
  const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/api/admin/shifts/"))
  const tabs = page.getByRole("navigation", { name: "Sections de l'événement" })
  await tabs.getByRole("link", { name: "Inscriptions" }).click()
  expect((await saved).ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/registrations$/)
  await page.goBack()
  await expect(page).toHaveURL(shiftsUrl)
  await expect(bar).toContainText("0/9")
})
