import { test, expect, type Browser, type Page } from "@playwright/test"
import {
  checkFocused, checkSelectedStates, emulateForcedColors, expectNoFailures, shot, stateSignature, sweep,
  type Scheme,
} from "./helpers/forced-colors"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * Keyboard focus in forced colours (#579, follow-up of #574), rendered under Chromium's emulation
 * (`forcedColors: "active"`), once with the light and once with the dark palette.
 *
 * Each test Tabs through one page or journey and checks, on every focused element: a computed
 * outline that is not `none`, wider than 0, not transparent (the probe shows that Chromium reports
 * the forced system colour, so the computed colour is a valid criterion), no `forced-color-adjust:
 * none` ancestor, visible and not covered, not clipped by an overflow ancestor or the viewport.
 * `disabled` controls are not focusable and look different; `aria-disabled` ones are focusable,
 * fully checked, carry the attribute, look different and do nothing on Enter / Space. Selected
 * states must differ by something that survives forcing. Failures are collected with a readable
 * name and asserted once per test, so one failure does not hide the others.
 *
 * What this proves: the technical presence of an outline under Chromium's emulation. It does not
 * prove its perceptibility in a real Windows contrast theme (Edge, « Night sky », « Desert »),
 * which stays a manual check.
 *
 * Set FORCED_COLORS_SHOTS_DIR to also save element screenshots for a visual review (no baselines).
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

/**
 * Defects this spec found that existed before #579 and are outside its scope. They are reported
 * for separate issues; each is matched precisely, recorded as an annotation, and must still occur
 * (a fixed one fails the test until its entry is removed), so the list cannot go stale.
 */
// Defects found by this spec that predate #579, each with its own issue: an entry must still
// reproduce (the test fails otherwise) and goes away in the PR that fixes its issue.
const KNOWN_ISSUES: { test: string; match: RegExp; note: string }[] = [
  {
    test: "public event page: shift selection",
    match: /button « Sélectionner — Bar .*: outline left covered by positioned div « Bar Accueil Contrôle »/,
    note: "#583 — DayTimeline: the sticky role-label column (z-10) covers the left edge of the outline of a bar that starts at the first hour",
  },
  {
    test: "public cancel dialog",
    match: /cancel dialog: focus left the modal .* \(no focus trap\)/,
    note: "#584 — EventPageClient cancel alertdialog (aria-modal) has no focus trap: Tab leaves it for the page behind",
  },
  {
    test: "members page and import modal",
    match: /import modal, preview step: focus left the modal .* \(no focus trap\)/,
    note: "#585 — ModalShell focus trap counts the hidden file form of ImportModal's preview step, so Tab escapes after the last visible button",
  },
]

function settle(failures: string[]) {
  const title = test.info().title
  const known = KNOWN_ISSUES.filter((k) => k.test === title)
  const unknown = failures.filter((f) => !known.some((k) => k.match.test(f)))
  for (const k of known) {
    const hits = failures.filter((f) => k.match.test(f))
    test.info().annotations.push({ type: "known issue (outside #579)", description: `${k.note}${hits.length ? "" : " — NOT REPRODUCED"}` })
    if (hits.length === 0) unknown.push(`known issue no longer reproduced, remove it from KNOWN_ISSUES: ${k.note}`)
  }
  expectNoFailures(unknown)
}

type Data = {
  eventId: string
  slug: string
  barLabel: string
  editToken: string
  questionLabel: string
  pendingName: string
  noEmailName: string
  withEmailName: string
}

let data: Data

async function login(page: Page, email = ORG_ADMIN_EMAIL, password = ORG_ADMIN_PASSWORD) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mot de passe").fill(password)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events|\/super-admin/)
}

/** A published event with three shifts (one on approval), a required text question and a choice
 *  question, a registration with and one without email, a pending request, and a public sign-up
 *  whose management token opens the cancel dialog. Created once for both palettes. */
async function setUp(browser: Browser): Promise<Data> {
  const page = await browser.newPage()
  await login(page)
  const stamp = Date.now()
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Forced Colours ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" })
  const bar = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 5 })
  const accueil = await post("/api/admin/shifts", { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 5 })
  const approval = await post("/api/admin/shifts", { eventId: event.id, roleName: "Contrôle", label: "Contrôle", date: "2030-10-01", startTime: "17:00", endTime: "19:00", capacity: 3, requiresApproval: true })
  const question = await post(`/api/admin/events/${event.id}/questions`, { label: "Taille de t-shirt", type: "text", required: true })
  await post(`/api/admin/events/${event.id}/questions`, { label: "Repas", type: "single", options: ["Standard", "Végétarien"], required: false })
  await post("/api/admin/registrations", { eventId: event.id, shiftId: bar.id, firstName: "E2E", lastName: `AvecEmail${stamp}`, email: `e2e-fc-with-${stamp}@example.com` })
  await post("/api/admin/registrations", { eventId: event.id, shiftId: accueil.id, firstName: "E2E", lastName: `SansEmail${stamp}`, email: "" })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  // A distinct client address per sign-up, as registration-concurrency.spec.ts does: the public
  // sign-up is rate limited per IP, and a retried worker runs this set-up again.
  const signup = (shiftId: string, who: string) => page.request.post("/api/public/registrations", {
    headers: { "x-forwarded-for": `10.79.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    data: { eventId: event.id, shiftIds: [shiftId], firstName: "E2E", lastName: `${who}${stamp}`, email: `e2e-fc-${who.toLowerCase()}-${stamp}@example.com`, consent: true, answers: { [question.id]: "M" } },
  })
  const pending = await signup(approval.id, "Demande")
  expect(pending.ok(), await pending.text()).toBeTruthy()
  const own = await signup(bar.id, "Session")
  expect(own.ok(), await own.text()).toBeTruthy()
  // The management link only goes out by email (#285): read it from Mailpit.
  const mail = await waitForMessage(`to:"e2e-fc-session-${stamp}@example.com"`)
  const editToken = (await getMessageText(mail.ID)).match(/\/my\/([\w-]+)/)?.[1] ?? ""
  expect(editToken, "the confirmation email carries the management link").toBeTruthy()
  await page.close()
  return {
    eventId: event.id, slug: event.slug, barLabel: "Bar", editToken, questionLabel: "Taille de t-shirt",
    pendingName: `E2E Demande${stamp}`, noEmailName: `E2E SansEmail${stamp}`, withEmailName: `E2E AvecEmail${stamp}`,
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  data = await setUp(browser)
})

const publicUrl = () => `/${data.slug}?org=default`

for (const scheme of ["light", "dark"] as Scheme[]) {
  test.describe(`forced colours, ${scheme} palette`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1280, height: 800 } })
    test.beforeEach(async ({ page }) => {
      test.setTimeout(180_000) // the dev server compiles each page on its first visit
      await emulateForcedColors(page, scheme)
    })
    const name = (page: string, control: string, state: string) => `${page}__${control}__${state}__${scheme}`

    test("probe: emulation active, author colours forced, outline colour reported", async ({ page }) => {
      await page.goto("/admin/login")
      const probe = await page.evaluate(() => {
        const box = document.createElement("div")
        box.style.background = "rgb(255, 0, 0)"
        box.textContent = "probe"
        const input = document.createElement("input")
        input.className = "input"
        input.setAttribute("aria-label", "probe")
        document.body.prepend(input)
        document.body.append(box)
        input.focus()
        const s = getComputedStyle(input)
        return {
          matches: matchMedia("(forced-colors: active)").matches,
          probeBackground: getComputedStyle(box).backgroundColor,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          outline: { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset },
        }
      })
      test.info().annotations.push({ type: "probe", description: JSON.stringify(probe) })
      expect(probe.matches).toBe(true)
      expect(probe.probeBackground, "an author background is forced").not.toBe("rgb(255, 0, 0)")
      // `.input:focus` under forced colours: `outline: 2px solid transparent`, repainted by the system.
      expect(probe.outline.style).toBe("solid")
      expect(probe.outline.width).toBe("2px")
      expect(probe.outline.color, "Chromium reports the forced colour, not transparent").not.toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/)
      expect(probe.bodyBackground).toBe(scheme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)")
    })

    test("public event page: shift selection", async ({ page }) => {
      const failures: string[] = []
      await page.goto(publicUrl())
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "event page", { min: 5 })).failures)
      await page.getByRole("button", { name: /Sélectionner.*Bar/ }).first().click()
      await expect(page.getByRole("button", { name: /^Continuer/ }).first()).toBeVisible()
      await page.goto(publicUrl()) // a fresh start of the Tab order, the selection is not kept
      await page.getByRole("button", { name: /Sélectionner.*Accueil/ }).first().click()
      failures.push(...(await sweep(page, "event page with a selection", { min: 6 })).failures)
      failures.push(...(await checkSelectedStates(page, "event page")))
      settle(failures)
    })

    test("public sign-up form and its error state", async ({ page }) => {
      const failures: string[] = []
      await page.goto(publicUrl())
      await page.getByRole("button", { name: /Sélectionner.*Accueil/ }).first().click()
      await page.getByRole("button", { name: /^Continuer/ }).first().click()
      await expect(page.getByLabel("Prénom *", { exact: true })).toBeVisible()
      failures.push(...(await sweep(page, "sign-up form", { min: 8 })).failures)
      await page.getByLabel("Prénom *", { exact: true }).focus()
      await shot(page, page.getByLabel("Prénom *", { exact: true }), name("signup", "input", "focused"))

      // Error state: the required question answered with a blank, which passes the browser's
      // `required` check and is refused by the form's own check (aria-invalid, message, focus).
      await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
      await page.getByLabel("Nom *", { exact: true }).fill("Erreur")
      await page.getByLabel("Email *", { exact: true }).fill(`e2e-fc-error-${Date.now()}@example.com`)
      await page.getByRole("button", { name: "convention des bénévoles" }).click()
      await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
      await page.getByLabel(/J.accepte que mes données/).check()
      const question = page.getByLabel(new RegExp(data.questionLabel))
      await question.fill(" ")
      await page.getByRole("button", { name: "Confirmer mon inscription" }).focus()
      await page.keyboard.press("Enter")
      await expect(question).toHaveAttribute("aria-invalid", "true")
      await expect(question).toBeFocused()
      await shot(page, question, name("signup", "invalid-question", "focused"))
      failures.push(...(await checkFocused(page, "sign-up error, first invalid field focused by code")))
      failures.push(...(await sweep(page, "sign-up form in error", { min: 8 })).failures)
      settle(failures)
    })

    test("public sign-up: aria-disabled submit while sending", async ({ page }) => {
      const failures: string[] = []
      await page.goto(publicUrl())
      await page.getByRole("button", { name: /Sélectionner.*Accueil/ }).first().click()
      await page.getByRole("button", { name: /^Continuer/ }).first().click()
      await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
      await page.getByLabel("Nom *", { exact: true }).fill("Envoi")
      await page.getByLabel("Email *", { exact: true }).fill(`e2e-fc-sending-${Date.now()}@example.com`)
      await page.getByLabel(new RegExp(data.questionLabel)).fill("M")
      await page.getByRole("button", { name: "convention des bénévoles" }).click()
      await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
      await page.getByLabel(/J.accepte que mes données/).check()
      // Hold the request so the submit stays in its aria-disabled state, then answer 500.
      let posts = 0
      let release!: () => void
      const held = new Promise<void>((r) => { release = r })
      await page.route("**/api/public/registrations", async (route) => {
        if (route.request().method() !== "POST") return route.continue()
        posts++
        await held
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "test" }) })
      })
      const submit = page.getByRole("button", { name: "Confirmer mon inscription" })
      await submit.focus()
      await page.keyboard.press("Enter")
      const sending = page.getByRole("button", { name: "Envoi en cours…" })
      await expect(sending).toHaveAttribute("aria-disabled", "true")
      await expect(sending).toBeFocused()
      failures.push(...(await checkFocused(page, "sign-up submit while sending")))
      // `transition-all` animates the opacity: wait for it to settle before judging the look.
      await expect.poll(() => sending.evaluate((e) => parseFloat(getComputedStyle(e).opacity)), { timeout: 2000 }).toBeLessThan(1)
        .catch(() => failures.push("sign-up submit while sending: looks like the enabled button (opacity 1)"))
      await page.keyboard.press("Enter")
      await page.keyboard.press("Space")
      await page.waitForTimeout(300)
      if (posts !== 1) failures.push(`sign-up submit while sending: Enter/Space sent ${posts - 1} more request(s)`)
      await shot(page, sending, name("signup", "submit", "aria-disabled-focused"))
      release()
      // The failure box (role=alert) takes the focus from code: tabIndex={-1}, no outline required.
      await expect(page.getByRole("alert").first()).toBeVisible()
      settle(failures)
    })

    test("public cancel dialog", async ({ page }) => {
      const failures: string[] = []
      // Reading the management token is rate limited per client address: one address per run.
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.80.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })
      await page.goto(publicUrl())
      await page.evaluate(([slug, token]) => localStorage.setItem(`benevoles_token_${slug}`, token), [data.slug, data.editToken])
      await page.goto(publicUrl())
      const cancel = page.getByRole("button", { name: /^Annuler l'inscription à/ }).first()
      await expect(cancel).toBeVisible()
      await cancel.focus()
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("alertdialog")
      await expect(dialog).toBeVisible()
      failures.push(...(await sweep(page, "cancel dialog", { min: 2, within: "[role=alertdialog]", trap: true })).failures)
      // Close with its own « Annuler »: without a trap the focus may be outside the dialog now.
      await dialog.getByRole("button", { name: "Annuler" }).focus()
      await page.keyboard.press("Enter")
      await expect(dialog).toBeHidden()
      settle(failures)
    })

    test("public content pages, link request and password recovery", async ({ page }) => {
      const failures: string[] = []
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.81.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` })
      await page.goto("/doc")
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "doc", { min: 5 })).failures)
      const theme = page.getByRole("button", { name: "Thème sombre" })
      const before = await stateSignature(theme)
      await theme.focus()
      await page.keyboard.press("Enter")
      await page.evaluate(() => (document.activeElement as HTMLElement).blur())
      if (JSON.stringify(before) === JSON.stringify(await stateSignature(theme))) failures.push("doc theme toggle: pressed and not pressed look the same in forced colours")
      for (const [label, url, min] of [
        ["link request (invalid management link)", "/my/not-a-real-token", 2],
        ["forgot password", "/admin/forgot-password", 2],
      ] as const) {
        await page.goto(url)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        failures.push(...(await sweep(page, label, { min })).failures)
      }
      settle(failures)
    })

    test("admin login, and its aria-disabled submit while signing in", async ({ page }) => {
      const failures: string[] = []
      await page.goto("/admin/login")
      failures.push(...(await sweep(page, "login", { min: 3 })).failures)
      // An address with no account: a deliberate failure on the org admin's address would count
      // against its login budget (10 failures per 15 min) and lock it out for the later specs (#592).
      await page.getByLabel("Email").fill("no-account@example.com")
      await page.getByLabel("Mot de passe").fill("wrong-password")
      let posts = 0
      let release!: () => void
      const held = new Promise<void>((r) => { release = r })
      await page.route("**/api/auth/callback/credentials**", async (route) => {
        posts++
        await held
        await route.continue()
      })
      const submit = page.getByRole("button", { name: /Se connecter|Connexion/ })
      // Disabled until the page is hydrated (#592): focus and Enter before that would do nothing.
      await expect(submit).toBeEnabled()
      await submit.focus()
      await page.keyboard.press("Enter")
      await expect(submit).toHaveAttribute("aria-disabled", "true")
      failures.push(...(await checkFocused(page, "login submit while signing in")))
      await page.keyboard.press("Enter")
      await page.keyboard.press("Space")
      await page.waitForTimeout(300)
      if (posts > 1) failures.push(`login submit while signing in: Enter/Space sent ${posts - 1} more request(s)`)
      if (posts === 0) failures.push("login submit while signing in: the sign-in request was not seen (route pattern)")
      release()
      settle(failures)
    })

    test("admin user menu", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      const trigger = page.getByRole("button", { name: /compte|Administrateur/i }).first()
      await trigger.focus()
      await page.keyboard.press("Enter")
      const menu = page.getByRole("menu", { name: "Menu du compte" })
      await expect(menu).toBeVisible()
      failures.push(...(await checkFocused(page, "user menu, first item")))
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("ArrowDown")
        failures.push(...(await checkFocused(page, `user menu, item after ${i + 1} ArrowDown`)))
      }
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("registrations page: search, filters, rows", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "registrations", { min: 12 })).failures)
      const search = page.getByPlaceholder(/^Rechercher \(nom/)
      await search.focus()
      await shot(page, search, name("registrations", "search", "focused"))
      settle(failures)
    })

    test("registrations page: manual add form", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      const open = page.getByRole("button", { name: "+ Ajouter manuellement" })
      await open.focus()
      await page.keyboard.press("Enter")
      await expect(page.getByLabel("Prénom *", { exact: true })).toBeVisible()
      failures.push(...(await sweep(page, "manual add", { min: 14 })).failures)
      await page.getByLabel("Prénom *", { exact: true }).focus()
      await shot(page, page.getByLabel("Prénom *", { exact: true }), name("registrations", "input", "focused"))
      await page.getByRole("button", { name: "Ajouter", exact: true }).focus()
      await page.keyboard.press("Enter")
      failures.push(...(await checkFocused(page, "manual add, empty submit")))
      failures.push(...(await sweep(page, "manual add in error", { min: 14 })).failures)
      settle(failures)
    })

    test("registrations page: bulk actions bar and confirm modal", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      // The row without an email: « Rendre responsable » and « Renvoyer le lien » are aria-disabled.
      const row = page.locator("tbody tr", { hasText: data.noEmailName })
      await row.getByRole("checkbox").check()
      const bar = page.getByRole("group", { name: "Actions sur la sélection" })
      await expect(bar).toBeVisible()
      await expect(bar.getByRole("button", { name: "Rendre responsable" })).toHaveAttribute("aria-disabled", "true")
      failures.push(...(await sweep(page, "bulk bar", { min: 12 })).failures)
      await shot(page, bar, name("registrations", "bulk-bar", "idle"))
      await bar.getByRole("button", { name: "Rendre responsable" }).focus()
      await shot(page, bar, name("registrations", "bulk-bar", "aria-disabled-focused"))
      const remove = bar.getByRole("button", { name: /^Retirer de leur créneau/ })
      await remove.focus()
      await page.keyboard.press("Enter")
      await expect(page.getByRole("alertdialog")).toBeVisible()
      failures.push(...(await sweep(page, "confirm modal", { min: 2, within: "[role=alertdialog]", trap: true })).failures)
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("registrations page: make-leader modal", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      await page.locator("tbody tr", { hasText: data.withEmailName }).getByRole("checkbox").check()
      const leader = page.getByRole("group", { name: "Actions sur la sélection" }).getByRole("button", { name: "Rendre responsable" })
      await leader.focus()
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      failures.push(...(await sweep(page, "make-leader modal", { min: 2, within: "[role=dialog]", trap: true })).failures)
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("registrations page: decision dialog for a pending request", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      const refuse = page.locator("tbody tr", { hasText: data.pendingName }).getByRole("button", { name: /^Refuser/ })
      await refuse.focus()
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first()
      await expect(dialog).toBeVisible()
      failures.push(...(await sweep(page, "decision dialog", { min: 2, within: "[role=dialog],[role=alertdialog]", trap: true })).failures)
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("ShiftSelect: the active option (aria-activedescendant) and the selected one", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      const filter = page.getByRole("combobox", { name: "Filtrer par créneau" })
      await shot(page, filter, name("registrations", "shiftselect-trigger", "idle"))
      await filter.focus()
      failures.push(...(await checkFocused(page, "ShiftSelect trigger")))
      await shot(page, filter, name("registrations", "shiftselect-trigger", "focused"))
      await page.keyboard.press("ArrowDown")
      await expect(filter).toHaveAttribute("aria-expanded", "true")
      const listbox = page.getByRole("listbox", { name: "Filtrer par créneau" })

      const active = async () => {
        const id = await filter.getAttribute("aria-activedescendant")
        return id ? page.locator(`[id="${id}"]`) : null
      }
      const outlineOf = (loc: import("@playwright/test").Locator) => loc.evaluate((el) => {
        const s = getComputedStyle(el)
        const panel = el.closest("[role=listbox]") as HTMLElement
        const r = el.getBoundingClientRect(), p = panel.getBoundingClientRect()
        const ext = (parseFloat(s.outlineOffset) || 0) + (parseFloat(s.outlineWidth) || 0)
        const clip = { left: p.left + panel.clientLeft, top: p.top + panel.clientTop, right: p.left + panel.clientLeft + panel.clientWidth, bottom: p.top + panel.clientTop + panel.clientHeight }
        const inside = ext <= 0
          ? r.left >= clip.left - 0.5 && r.right <= clip.right + 0.5 && r.top >= clip.top - 0.5 && r.bottom <= clip.bottom + 0.5
          : r.left - ext >= clip.left - 0.5 && r.right + ext <= clip.right + 0.5 && r.top - ext >= clip.top - 0.5 && r.bottom + ext <= clip.bottom + 0.5
        return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor, inside: inside || r.bottom > clip.bottom || r.top < clip.top }
      })
      const transparent = (c: string) => c === "transparent" || /^rgba\(\d+, \d+, \d+, 0\)$/.test(c)
      const first = await active()
      if (!first) failures.push("ShiftSelect: no aria-activedescendant after ArrowDown")
      else {
        const o = await outlineOf(first)
        if (o.style !== "solid" || o.width < 2 || transparent(o.color)) failures.push(`ShiftSelect active option: outline ${o.style} ${o.width}px ${o.color}`)
        if (!o.inside) failures.push("ShiftSelect active option: outline clipped by the panel")
        await shot(page, listbox, name("registrations", "shiftselect-open", "active-option"))
        await page.keyboard.press("ArrowDown")
        const second = await active()
        if (!second) failures.push("ShiftSelect: no aria-activedescendant after a second ArrowDown")
        else {
          const o2 = await outlineOf(second)
          if (o2.style !== "solid" || o2.width < 2) failures.push(`ShiftSelect: indicator did not move (${o2.style})`)
          const back = await outlineOf(first)
          if (back.style !== "none") failures.push(`ShiftSelect: previous option kept its outline (${back.style})`)
        }
        // A non-active option has no outline.
        const others = listbox.getByRole("option")
        const count = await others.count()
        const activeId = await filter.getAttribute("aria-activedescendant")
        for (let i = 0; i < count; i++) {
          const opt = others.nth(i)
          if ((await opt.getAttribute("id")) === activeId) continue
          const o3 = await outlineOf(opt)
          if (o3.style !== "none") failures.push(`ShiftSelect: non-active option ${i} has an outline (${o3.style})`)
          break
        }
      }
      // Choose the active option, reopen: the selected option carries a visible check mark.
      await page.keyboard.press("Enter")
      await expect(filter).toHaveAttribute("aria-expanded", "false")
      await page.keyboard.press("ArrowDown")
      await expect(listbox).toBeVisible()
      const selected = listbox.locator('[role=option][aria-selected="true"]')
      await expect(selected).toHaveCount(1)
      const check = await selected.evaluate((el) => {
        const svg = el.querySelector("svg")
        if (!svg) return null
        const b = svg.getBoundingClientRect()
        // Any CSS colour (Tailwind 4 computes lab() / oklch()) to sRGB through a canvas.
        const ctx = document.createElement("canvas").getContext("2d")!
        const lum = (c: string) => {
          ctx.clearRect(0, 0, 1, 1)
          ctx.fillStyle = c
          ctx.fillRect(0, 0, 1, 1)
          const [r, g, bl] = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          return 0.2126 * r + 0.7152 * g + 0.0722 * bl
        }
        let bg = "rgb(255, 255, 255)"
        for (let a: Element | null = el; a; a = a.parentElement) {
          const c = getComputedStyle(a).backgroundColor
          if (!/rgba\(.*, 0\)$|transparent/.test(c)) { bg = c; break }
        }
        const fg = getComputedStyle(svg).color
        const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x)
        const activeOutline = getComputedStyle(el).outlineStyle
        return { w: b.width, h: b.height, fg, bg, ratio: (l1 + 0.05) / (l2 + 0.05), activeOutline }
      })
      if (!check) failures.push("ShiftSelect selected option: no check mark")
      else {
        test.info().annotations.push({ type: "check mark", description: JSON.stringify(check) })
        if (!(check.w > 0 && check.h > 0)) failures.push("ShiftSelect selected option: empty check mark")
        if (check.ratio < 3) failures.push(`ShiftSelect check mark: contrast ${check.ratio.toFixed(2)}:1 (${check.fg} on ${check.bg})`)
      }
      await shot(page, listbox, name("registrations", "shiftselect-open", "selected-option"))
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("shifts page", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/shifts`)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "shifts", { min: 8 })).failures)
      // The list view, reached with the toggle, swept the same way (from the toggle, all around).
      await page.getByRole("button", { name: "Liste", exact: true }).click()
      failures.push(...(await sweep(page, "shifts, list view", { min: 8 })).failures)
      settle(failures)
    })

    test("shifts page view toggle (Timeline / Liste)", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/shifts`)
      const group = page.getByRole("group", { name: "Affichage des créneaux" })
      await expect(group).toBeVisible()
      const timeline = group.getByRole("button", { name: "Timeline", exact: true })
      const list = group.getByRole("button", { name: "Liste", exact: true })
      for (const b of [timeline, list]) {
        await b.focus()
        await page.keyboard.press("Shift+Tab")
        await page.keyboard.press("Tab")
        failures.push(...(await checkFocused(page, "view toggle")))
      }
      if ((await timeline.getAttribute("aria-pressed")) !== "true") failures.push("view toggle: Timeline (current view) has no aria-pressed=\"true\"")
      if ((await list.getAttribute("aria-pressed")) !== "false") failures.push("view toggle: Liste has no aria-pressed=\"false\"")
      await page.evaluate(() => (document.activeElement as HTMLElement).blur())
      const [a, b] = [await stateSignature(timeline), await stateSignature(list)]
      if (JSON.stringify(a) === JSON.stringify(b)) failures.push("view toggle: the selected view looks like the other one in forced colours")
      // Switch with the keyboard: the pressed states flip and the focus stays on Liste, outline whole.
      await list.focus()
      await page.keyboard.press("Enter")
      await expect(list).toHaveAttribute("aria-pressed", "true")
      await expect(timeline).toHaveAttribute("aria-pressed", "false")
      await expect(list).toBeFocused()
      failures.push(...(await checkFocused(page, "view toggle after switching")))
      // The colours transition (transition-colors): measure the selected state once it has settled.
      await group.evaluate((g) => Promise.all(g.getAnimations({ subtree: true }).map((a) => a.finished)))
      failures.push(...(await checkSelectedStates(page, "view toggle", { within: '[role="group"][aria-label="Affichage des créneaux"]' })))
      // Chromium paints a Canvas plate behind text in forced colours: a label coloured like Canvas
      // (HighlightText, say) is invisible on it, which the signature above cannot see.
      const plate = await page.evaluate(() => {
        const probe = document.createElement("div")
        probe.style.color = "Canvas"
        document.body.append(probe)
        const c = getComputedStyle(probe).color
        probe.remove()
        return c
      })
      for (const b of [timeline, list]) {
        const color = await b.evaluate((e) => getComputedStyle(e).color)
        if (color === plate) failures.push(`view toggle: « ${await b.textContent()} » text is the Canvas colour (${color}), invisible on its plate`)
      }
      await shot(page, group, name("shifts", "view-toggle", "list-selected"))
      settle(failures)
    })

    test("shifts page: shift popover", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/shifts`)
      const bar = page.getByRole("region", { name: /^Planning du/ }).getByRole("button", { name: /^Bar/ }).first()
      await bar.focus()
      await page.keyboard.press("Enter")
      const popover = page.getByRole("dialog")
      await expect(popover).toBeVisible()
      await expect(popover.getByRole("button", { name: "Décaler" })).toHaveAttribute("aria-disabled", "true")
      failures.push(...(await sweep(page, "shift popover", { min: 7, within: "[role=dialog]", trap: false })).failures)
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("shifts page: series form", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/shifts`)
      const open = page.getByRole("button", { name: "Créer une série" })
      await open.focus()
      await page.keyboard.press("Enter")
      await expect(open).toHaveAttribute("aria-expanded", "true")
      failures.push(...(await sweep(page, "series form", { min: 12 })).failures)
      settle(failures)
    })

    test("shifts page: role settings", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/shifts`)
      await page.getByRole("button", { name: "Gérer les postes" }).click()
      for (const control of [/^Changer la couleur du poste Bar/, /^Limite : .*Bar/, /^Accès : .*Bar/]) {
        const button = page.getByRole("button", { name: control }).first()
        await button.focus()
        await page.keyboard.press("Enter")
      }
      failures.push(...(await sweep(page, "role settings", { min: 15 })).failures)
      failures.push(...(await checkSelectedStates(page, "role settings")))
      settle(failures)
    })

    test("event form and event sub-pages", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      for (const [label, sub, min] of [
        ["event overview", "", 8],
        ["event edit form", "/edit", 15],
        ["event questions", "/questions", 6],
        ["event pages", "/pages", 4],
        ["event sector leaders", "/sector-leaders", 4],
        ["event message", "/message", 6],
        ["event invitations", "/invitations", 4],
      ] as const) {
        await page.goto(`/admin/events/${data.eventId}${sub}`)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        failures.push(...(await sweep(page, label, { min })).failures)
        failures.push(...(await checkSelectedStates(page, label)))
      }
      settle(failures)
    })

    test("members page and import modal", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto("/admin/members")
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "members", { min: 5, max: 1500 })).failures)
      const add = page.getByRole("button", { name: "+ Nouveau membre" })
      await add.focus()
      await page.keyboard.press("Enter")
      await expect(page.getByRole("dialog")).toBeVisible()
      failures.push(...(await sweep(page, "add member modal", { min: 4, within: "[role=dialog]", trap: true })).failures)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog")).toBeHidden()
      const open = page.getByRole("button", { name: /^Importer/ }).first()
      await open.focus()
      await page.keyboard.press("Enter")
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      const stamp = Date.now()
      const csv = `prénom,nom,email\nAlice,Import${stamp},e2e-fc-import-${stamp}@example.com\nBob,Import${stamp},pas-un-email\n`
      await dialog.locator('input[type="file"]').setInputFiles({ name: "membres.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
      failures.push(...(await sweep(page, "import modal, file step", { min: 5, within: "[role=dialog]", trap: true })).failures)
      const analyse = dialog.getByRole("button", { name: "Analyser le fichier" })
      await analyse.focus()
      await page.keyboard.press("Enter")
      const summary = dialog.getByText("Analyse du fichier, rien n'est encore enregistré.")
      await expect(summary).toBeVisible()
      // The summary paragraph takes the focus from code after a keyboard action: focus-visible outline.
      failures.push(...(await checkFocused(page, "import summary paragraph (focused by code)")))
      await shot(page, summary.locator(".."), name("members-import", "summary", "focused"))
      failures.push(...(await sweep(page, "import modal, preview step", { min: 4, within: "[role=dialog]", trap: true })).failures)
      for (const region of await dialog.getByRole("region").all()) {
        await region.focus()
        await page.keyboard.press("Shift+Tab")
        await page.keyboard.press("Tab")
        failures.push(...(await checkFocused(page, "import region")))
        const which = (await region.getAttribute("aria-labelledby"))?.includes("lines") ? "lines" : "errors"
        await shot(page, region, name("members-import", `region-${which}`, "focused"))
        await page.evaluate(() => (document.activeElement as HTMLElement).blur())
        await shot(page, region, name("members-import", `region-${which}`, "idle"))
      }
      const confirm = dialog.getByRole("button", { name: /^Importer \d+ membre/ })
      await confirm.focus()
      await page.keyboard.press("Enter")
      await expect(dialog.getByText(/Import terminé/)).toBeVisible()
      failures.push(...(await checkFocused(page, "import result paragraph (focused by code)")))
      await shot(page, dialog.getByText(/Import terminé/), name("members-import", "result", "focused"))
      await page.keyboard.press("Escape")
      settle(failures)
    })

    test("organisation settings forms and the charter switch", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto("/admin/settings/admins")
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "settings", { min: 10 })).failures)
      const toggle = page.getByRole("switch", { name: "Assurance RC fournie par l'organisation" })
      const initial = await toggle.getAttribute("aria-checked")
      await toggle.focus()
      await page.keyboard.press("Shift+Tab")
      await page.keyboard.press("Tab")
      failures.push(...(await checkFocused(page, "charter switch")))
      await shot(page, toggle, name("settings", "charter-switch", `${initial === "true" ? "on" : "off"}-focused`))
      const blur = () => page.evaluate(() => (document.activeElement as HTMLElement).blur())
      await blur()
      await shot(page, toggle, name("settings", "charter-switch", `${initial === "true" ? "on" : "off"}-idle`))
      const before = await stateSignature(toggle)
      await toggle.focus()
      await page.keyboard.press("Space")
      await expect(toggle).toHaveAttribute("aria-checked", initial === "true" ? "false" : "true")
      await blur()
      // Let the 200 ms colour / slide transition finish before measuring or taking the picture.
      await toggle.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
      const after = await stateSignature(toggle)
      if (JSON.stringify(before) === JSON.stringify(after)) failures.push("charter switch: on and off look the same in forced colours")
      await shot(page, toggle, name("settings", "charter-switch", `${initial === "true" ? "off" : "on"}-idle`))
      await toggle.focus()
      await page.keyboard.press("Space") // back to the stored state; nothing is saved without « Enregistrer »
      for (const [label, url, min] of [
        ["account", "/admin/account", 4],
        ["message templates", "/admin/settings/message-templates", 3],
      ] as const) {
        await page.goto(url)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        failures.push(...(await sweep(page, label, { min })).failures)
      }
      settle(failures)
    })

    test("notification settings", async ({ page }) => {
      const failures: string[] = []
      await login(page)
      await page.goto("/admin/settings/notifications")
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      failures.push(...(await sweep(page, "notifications", { min: 4 })).failures)
      settle(failures)
    })

    test("super-admin pages", async ({ page }) => {
      const failures: string[] = []
      await login(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
      for (const [label, url, min] of [
        ["super-admin organisations", "/super-admin/organizations", 4],
        ["super-admin organisation detail", "/super-admin/organizations/default", 5],
        ["super-admin new organisation", "/super-admin/organizations/new", 4],
        ["super-admin profile", "/super-admin/profile", 4],
      ] as const) {
        await page.goto(url)
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
        failures.push(...(await sweep(page, label, { min })).failures)
      }
      settle(failures)
    })

    test(".input field, focused and not (screenshots)", async ({ page }) => {
      test.skip(!process.env.FORCED_COLORS_SHOTS_DIR, "screenshots only")
      await login(page)
      await page.goto(`/admin/events/${data.eventId}/registrations`)
      await page.getByRole("button", { name: "+ Ajouter manuellement" }).click()
      const input = page.locator("input.input").first()
      await shot(page, input, name("registrations", "dot-input", "idle"))
      await input.focus()
      await shot(page, input, name("registrations", "dot-input", "focused"))
      await page.goto(`/admin/events/${data.eventId}/shifts`)
      const toggle = page.getByRole("group", { name: "Affichage des créneaux" })
      await shot(page, toggle, name("shifts", "view-toggle", "timeline-selected-idle"))
      await toggle.getByRole("button", { name: "Liste", exact: true }).focus()
      await page.keyboard.press("Shift+Tab")
      await page.keyboard.press("Tab")
      await shot(page, toggle, name("shifts", "view-toggle", "liste-focused"))
    })
  })
}
