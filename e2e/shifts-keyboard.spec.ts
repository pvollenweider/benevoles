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

/** A one-day event with a « Bar » and an « Accueil » shift, opened on its shifts page. */
async function openShiftsPage(page: Page) {
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
  const role = editor.getByLabel("Poste *")
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
  await editor.getByLabel("Début *").fill("17:00")
  await expect(editor.getByLabel("Fin *")).toHaveValue("18:00")
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
  await expect(editor.getByLabel("Poste *")).toBeFocused()
  await editor.getByRole("button", { name: "Annuler" }).focus()
  await page.keyboard.press("Enter")
  await expect(editor).toBeHidden()
  await expect(add).toBeFocused()
})

test("after editing a shift from the list, focus is back on that row's « Modifier »", async ({ page }) => {
  await openShiftsPage(page)
  await page.getByRole("button", { name: "Liste", exact: true }).click()
  const barEdit = () => page.getByRole("row", { name: /Bar/ }).getByRole("button", { name: "Modifier" })
  await barEdit().focus()
  await page.keyboard.press("Enter")

  const editor = page.getByRole("group", { name: "Modifier le créneau" })
  await expect(editor.getByLabel("Poste *")).toBeFocused()
  await editor.getByLabel("Fin *").fill("13:00")
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
  await page.getByRole("row", { name: /Bar/ }).getByRole("button", { name: "Modifier" }).click()
  const editor = page.getByRole("group", { name: "Modifier le créneau" })
  await expect(editor).toBeVisible()
  await page.getByRole("button", { name: "Timeline", exact: true }).click()
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
})
