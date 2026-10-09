import { test, expect, type Browser, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, randomIp, type PublicEvent } from "./helpers/public-signup"

/**
 * ARIA snapshots of critical regions (#591, step 3): what the accessibility tree exposes (roles,
 * accessible names, pressed / expanded / invalid / disabled states, order), checked with
 * `toMatchAriaSnapshot`. Templates are partial (the default `contain` mode: listed nodes must be
 * there, in order, others may sit between them), and `/children: equal` where the exact list
 * matters (a menu's items, the view toggle). Counts are regular expressions.
 *
 * The aria snapshot does not carry the accessible description, `aria-required` or which element
 * has focus (`[active]` is ignored when matching): those are asserted next to the snapshots.
 * It is Chromium's accessibility tree as Playwright computes it, not what a screen reader says.
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

/** Two shifts on 2030-10-01 (« mardi 1 octobre »): Bar in the morning, Accueil in the afternoon. */
const SHIFTS = [
  { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 3 },
  { label: "Accueil", startTime: "14:00", endTime: "16:00", capacity: 2 },
]

let open: PublicEvent
let closed: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  const stamp = Date.now()
  open = await createPublicEvent(browser, `E2E Aria ${stamp}`, SHIFTS)
  closed = await createPublicEvent(browser, `E2E Aria fermé ${stamp}`, SHIFTS)
  await closeRegistrations(browser, closed.eventId)
})

async function closeRegistrations(browser: Browser, eventId: string) {
  const page = await browser.newPage()
  await login(page)
  const res = await page.request.patch(`/api/admin/events/${eventId}`, { data: { registrationsOpen: false } })
  expect(res.ok(), await res.text()).toBeTruthy()
  await page.close()
}

test.beforeEach(() => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
})

test.describe("public sign-up page, shift picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  })

  test("registrations open: bars are toggle buttons, then the selection and « Continuer »", async ({ page }) => {
    await page.goto(`/${open.slug}?org=default`)
    const region = page.getByRole("region", { name: "Planning du mardi 1 octobre" })
    const bar = region.getByRole("button", { name: /^10h–12h \d+\/\d+, Bar\b/ })
    await waitForHydration(bar)

    // Nothing selected: two buttons, not pressed, named with role, hours and free places.
    await expect(region.getByRole("button")).toHaveCount(2)
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - main:
        - heading "mardi 1 octobre" [level=2]
        - region "Planning du mardi 1 octobre":
          - button /^10h–12h \\d+.3, Bar\\W+sélectionner \\(\\d+ places? libres? sur 3\\)$/ [pressed=false]
          - button /^14h–16h \\d+.2, Accueil\\W+sélectionner \\(\\d+ places? libres? sur 2\\)$/ [pressed=false]
    `)
    await expect(page.getByRole("button", { name: /^Continuer/ })).toHaveCount(0)

    await bar.click()
    // Bar pressed, its name says the next action; the summary and the button to go on appear.
    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - main:
        - region "Planning du mardi 1 octobre":
          - button /^10h–12h \\d+.3, Bar\\W+désélectionner \\(\\d+ places? libres? sur 3\\)$/ [pressed]
          - button /^14h–16h \\d+.\\d+, Accueil\\W+sélectionner/ [pressed=false]
        - paragraph: Créneaux sélectionnés
        - button "Retirer Bar de la sélection"
        - button "Continuer (1 nouveau créneau)"
    `)

    await page.getByRole("button", { name: "Retirer Bar de la sélection" }).click()
    await expect(region).toMatchAriaSnapshot(`
      - region "Planning du mardi 1 octobre":
        - button /^10h–12h \\d+.\\d+, Bar\\W+sélectionner/ [pressed=false]
    `)
    await expect(page.getByRole("button", { name: /^Continuer/ })).toHaveCount(0)
  })

  test("registrations closed: the message comes first and describes the disabled bars", async ({ page }) => {
    await page.goto(`/${closed.slug}?org=default`)
    const message = "Les inscriptions sont fermées pour le moment. Si tu as déjà des créneaux, ton lien personnel reste valable."
    const region = page.getByRole("region", { name: "Planning du mardi 1 octobre" })
    await expect(region).toBeVisible()

    await expect(page.getByRole("main")).toMatchAriaSnapshot(`
      - main:
        - paragraph: ${message}
        - region "Planning du mardi 1 octobre":
          - button /^10h–12h \\d+.\\d+, Bar/ [disabled]
          - button /^14h–16h \\d+.\\d+, Accueil/ [disabled]
    `)
    // Not toggle buttons while closed: no pressed state at all.
    for (const b of await region.getByRole("button").all()) await expect(b).not.toHaveAttribute("aria-pressed")
    await expect(region).toHaveAccessibleDescription(message)
    await expect(page.getByRole("button", { name: /^Continuer/ })).toHaveCount(0)
  })
})

test.describe("admin", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("account menu, opened with the keyboard, then closed with Escape", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Navigation de l'administration" })
    const trigger = nav.getByRole("button", { name: "Administrateur (org par défaut)" })
    await waitForHydration(trigger)

    await expect(nav).toMatchAriaSnapshot(`
      - navigation "Navigation de l'administration":
        - button "Administrateur (org par défaut)" [expanded=false]
    `)
    await expect(page.getByRole("menu")).toHaveCount(0)

    await trigger.focus()
    await page.keyboard.press("Enter")
    // The menu follows its button in the tree, with exactly its two items.
    await expect(nav).toMatchAriaSnapshot(`
      - navigation "Navigation de l'administration":
        - button "Administrateur (org par défaut)" [expanded]
        - menu "Menu du compte":
          - /children: equal
          - menuitem "Mon compte"
          - menuitem "Se déconnecter"
    `)
    await expect(page.getByRole("menuitem", { name: "Mon compte" })).toBeFocused()

    await page.keyboard.press("Escape")
    await expect(nav).toMatchAriaSnapshot(`
      - navigation "Navigation de l'administration":
        - button "Administrateur (org par défaut)" [expanded=false]
    `)
    await expect(page.getByRole("menu")).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test("shifts page: the « Frise » / « Liste » toggle", async ({ page }) => {
    await page.goto(`/admin/events/${open.eventId}/shifts`)
    const group = page.getByRole("group", { name: "Affichage des créneaux" })
    const list = group.getByRole("button", { name: "Liste", exact: true })
    await waitForHydration(list)

    await expect(group).toMatchAriaSnapshot(`
      - group "Affichage des créneaux":
        - /children: equal
        - button "Frise" [pressed]
        - button "Liste" [pressed=false]
    `)

    await list.click()
    await expect(page.getByRole("table")).toBeVisible()
    await expect(group).toMatchAriaSnapshot(`
      - group "Affichage des créneaux":
        - /children: equal
        - button "Frise" [pressed=false]
        - button "Liste" [pressed]
    `)
    await expect(list).toBeFocused()
  })

  test("manual add form: fields, the missing-shift error, the open shift list, then the error cleared", async ({ page }) => {
    await page.goto(`/admin/events/${open.eventId}/registrations`)
    const openForm = page.getByRole("button", { name: "+ Ajouter manuellement" })
    await waitForHydration(openForm)
    await openForm.click()
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Inscription manuelle" }) })
    const combo = form.getByRole("combobox", { name: "Créneau", exact: true })

    // Every field named by its visible label (the « * » is hidden from the name).
    await expect(form).toMatchAriaSnapshot(`
      - heading "Inscription manuelle" [level=3]
      - textbox "Prénom"
      - textbox "Nom"
      - textbox "Email"
      - textbox "Téléphone"
      - combobox "Créneau" [expanded=false] [invalid=false]: Sélectionner un créneau…
      - textbox "Note"
      - button "Ajouter"
      - button "Annuler"
    `)
    await expect(combo).toHaveAttribute("aria-required", "true")

    await form.getByRole("textbox", { name: "Prénom", exact: true }).fill("E2E")
    await form.getByRole("textbox", { name: "Nom", exact: true }).fill(`Aria${Date.now()}`)
    await form.getByRole("button", { name: "Ajouter", exact: true }).click()

    // Error state: the field is invalid, its message follows it and describes it; focus goes there.
    await expect(form).toMatchAriaSnapshot(`
      - combobox "Créneau" [expanded=false] [invalid]: Sélectionner un créneau…
      - paragraph: Sélectionnez un créneau.
      - textbox "Note"
    `)
    await expect(combo).toHaveAccessibleDescription("Sélectionnez un créneau.")
    await expect(combo).toBeFocused()
    // The message is tied to the field, not repeated by an alert.
    await expect(form.getByRole("alert")).toHaveCount(0)

    await page.keyboard.press("ArrowDown")
    await expect(form).toMatchAriaSnapshot(`
      - combobox "Créneau" [expanded] [invalid]
      - listbox "Créneau":
        - /children: equal
        - option /^mar\\. 1 oct\\., de 10h à 12h, Bar, (aucun inscrit|\\d+ inscrits?) sur 3$/
        - option /^mar\\. 1 oct\\., de 14h à 16h, Accueil, (aucun inscrit|\\d+ inscrits?) sur 2$/
      - paragraph: Sélectionnez un créneau.
    `)

    await page.keyboard.press("Enter")
    // A shift chosen: the field is valid again and the message is gone.
    await expect(form).toMatchAriaSnapshot(`
      - combobox "Créneau" [expanded=false] [invalid=false]: /Bar/
      - textbox "Note"
    `)
    await expect(form.getByText("Sélectionnez un créneau.")).toHaveCount(0)
    await expect(form.getByRole("listbox")).toHaveCount(0)
  })
})
