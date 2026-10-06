import { test, expect } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"

/**
 * Automated accessibility checks on the critical paths (#487), as listed on /accessibilite:
 * no serious or critical axe-core violation. Keyboard and screen-reader checks stay manual.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"
const SUPER_ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@localhost"
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-password"

test.describe("public pages", () => {
  // /videos and /videos/[id] (#644) aren't linked from anywhere but are still reachable by URL —
  // same accessibility bar as every other page.
  for (const path of ["/", "/fonctionnalites", "/doc", "/doc/admin", "/doc/benevole", "/doc/creer-un-evenement", "/accessibilite", "/legal/privacy", "/videos", "/videos/EVENT_CREATE_BLANK"]) {
    test(`${path} has no serious violation`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect.soft(await seriousViolations(page)).toEqual([])
    })
  }

  // The FAQ answers are inside closed <details> during the scan above: open them all.
  test("/ FAQ answers have no serious violation", async ({ page }) => {
    await page.goto("/")
    await page.locator("details").evaluateAll((els) => els.forEach((d) => d.setAttribute("open", "")))
    expect.soft(await seriousViolations(page)).toEqual([])
  })

  test("event page, then the sign-up form, have no serious violation", async ({ page }) => {
    await page.goto("/spectacle-cirque-2026?org=default")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page)).toEqual([])
    await page.getByRole("button", { name: /Sélectionner.*Billetterie/ }).first().click()
    await page.getByRole("button", { name: /^Continuer/ }).click()
    await expect(page.getByLabel("Prénom *", { exact: true })).toBeVisible()
    expect.soft(await seriousViolations(page)).toEqual([])
  })
})

test.describe("content pages on a phone, in dark mode", () => {
  test.use({ viewport: { width: 320, height: 640 }, colorScheme: "dark" })
  // Documentation units (#649): the breadcrumb wraps at 320 px; an organisers' unit has wide tables.
  for (const path of ["/accessibilite", "/doc", "/doc/revenir-sur-la-page-d-inscription", "/doc/creer-un-evenement"]) {
    test(`${path} has no serious violation at 320 px, dark`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect.soft(await seriousViolations(page)).toEqual([])
    })
  }
})

test.describe("admin", () => {
  test("login, events, an event and its main pages have no serious violation", async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/admin/login")
    expect.soft(await seriousViolations(page)).toEqual([])
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)
    expect.soft(await seriousViolations(page)).toEqual([])

    await page.getByRole("link", { name: /Spectacle/ }).first().click()
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
    const base = page.url()
    expect.soft(await seriousViolations(page)).toEqual([])
    // « /questions » carries the answers summary (#686), with its tables or its empty state; « /review » the share link (#564) and the review checks (#565);
    // « /staffing/search » the shift picker of « Chercher des bénévoles » (#566).
    // « /day-of » (#561): its empty state here, outside the event's dates; with content in e2e/day-of.spec.ts.
    for (const sub of ["/shifts", "/registrations", "/message", "/invitations", "/questions", "/review", "/staffing", "/staffing/search", "/day-of"]) {
      await page.goto(base + sub)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      expect.soft(await seriousViolations(page), sub).toEqual([])
    }
  })

  // #556: a member's activity page, then the volunteer certificate (form and printable document).
  test("member activity and volunteer certificate have no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    const res = await page.request.post("/api/admin/members", { data: { firstName: "E2E", lastName: `A11y${Date.now()}` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const member = await res.json()

    await page.goto(`/admin/members/${member.id}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page), "member activity").toEqual([])

    await page.getByRole("link", { name: "Attestation de bénévolat" }).click()
    await expect(page).toHaveURL(/\/certificate$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page), "volunteer certificate").toEqual([])
  })

  // #300: the organization settings, with the logo form (upload, preview and removal states are
  // scanned in e2e/org-logo.spec.ts).
  test("organization settings page (with the logo form) has no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)
    await page.goto("/admin/settings/admins")
    await expect(page.getByRole("region", { name: "Logo de l'organisation" })).toBeVisible()
    expect.soft(await seriousViolations(page), "organization settings").toEqual([])
  })

  // #667: an eligible member's own page (inactive, no registration) shows the « Supprimer »
  // action, and its confirmation dialog — a new dialog state worth scanning on its own.
  test("member page's « Supprimer » confirmation dialog has no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    const res = await page.request.post("/api/admin/members", { data: { firstName: "E2E", lastName: `Del${Date.now()}`, active: false } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const member = await res.json()

    await page.goto(`/admin/members/${member.id}`)
    const deleteButton = page.getByRole("button", { name: /^Supprimer/ })
    await waitForHydration(deleteButton)
    await deleteButton.click()
    await expect(page.getByRole("alertdialog", { name: /^Supprimer/ })).toBeVisible()
    expect.soft(await seriousViolations(page), "member page, delete confirmation open").toEqual([])
  })

  // #516: the « Effacer les données personnelles » confirmation (recap and typed word), then the
  // erased record's page with the notice that replaces the action.
  test("member page's erasure confirmation and the erased record have no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    const res = await page.request.post("/api/admin/members", { data: { firstName: "E2E", lastName: `Erase${Date.now()}` } })
    expect(res.ok(), await res.text()).toBeTruthy()
    const member = await res.json()

    await page.goto(`/admin/members/${member.id}`)
    const eraseButton = page.getByRole("button", { name: /^Effacer les données personnelles/ })
    await waitForHydration(eraseButton)
    await eraseButton.click()
    const dialog = page.getByRole("alertdialog", { name: /^Effacer les données personnelles/ })
    await expect(dialog).toBeVisible()
    expect.soft(await seriousViolations(page), "member page, erasure confirmation open").toEqual([])

    await dialog.getByLabel("Pour confirmer, saisissez « effacer »").fill("effacer")
    await dialog.getByRole("button", { name: "Effacer les données", exact: true }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Activité de Bénévole effacé" })).toBeVisible()
    expect.soft(await seriousViolations(page), "erased member page").toEqual([])
  })

  // #557: the members list (new "Heures attestées" / "Dernière participation" columns and the
  // hours-export form), then an event's Rapports page with its post-event summary section.
  // #599: the dashboard, with its « Ce qui demande votre attention » section.
  test("members list and an event's Rapports page (with the post-event summary) have no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    await page.goto("/admin/dashboard")
    await expect(page.getByRole("heading", { name: "Ce qui demande votre attention" })).toBeVisible()
    expect.soft(await seriousViolations(page), "dashboard").toEqual([])

    await page.goto("/admin/members")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page), "members list").toEqual([])
    await page.getByText("Heures par bénévole, pour une période (CSV)").click()
    expect.soft(await seriousViolations(page), "members list, hours export open").toEqual([])

    await page.goto("/admin/events")
    await page.getByRole("link", { name: /Spectacle/ }).first().click()
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
    await page.goto(page.url() + "/print")
    await expect(page.getByRole("heading", { level: 1, name: "Rapports" })).toBeVisible()
    await expect(page.getByRole("heading", { level: 2, name: "Résumé de l'événement" })).toBeVisible()
    expect.soft(await seriousViolations(page), "reports page with summary").toEqual([])
  })

  // #587: the shifts page in list view, then with « Gérer les postes » and a colour picker open.
  test("shifts page: list view, roles panel and colour picker have no serious violation", async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)
    await page.getByRole("link", { name: /Spectacle/ }).first().click()
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
    await page.goto(page.url() + "/shifts")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.getByRole("button", { name: "Liste", exact: true }).click()
    await expect(page.getByRole("table")).toBeVisible()
    // The view toggle's colours transition (transition-colors): scan once they have settled.
    await page.getByRole("group", { name: "Affichage des créneaux" }).evaluate((g) => Promise.all(g.getAnimations({ subtree: true }).map((a) => a.finished)))
    expect.soft(await seriousViolations(page), "list view").toEqual([])
    await page.getByRole("button", { name: "Gérer les postes" }).click()
    await page.getByRole("button", { name: /^Changer la couleur du poste / }).first().click()
    await expect(page.getByRole("group", { name: /^Couleur du poste / })).toBeVisible()
    expect.soft(await seriousViolations(page), "roles panel and colour picker").toEqual([])
  })

  // #600: the merge page (member picker, then the preview with its field-choice and conflict
  // fieldsets), and the confirmation dialog.
  test("member merge page, preview and confirm dialog have no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    const post = async (url: string, body: unknown) => {
      const res = await page.request.post(url, { data: body })
      expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
      return res.json()
    }
    const suffix = Date.now()
    const lastName = `A11yMerge${suffix}`
    const keep = await post("/api/admin/members", { firstName: "Jean", lastName, email: `jean-a11y-keep-${suffix}@example.com` })
    await post("/api/admin/members", { firstName: "Jean", lastName, email: `jean-a11y-absorb-${suffix}@example.com`, notes: "Allergie noix" })

    await page.goto(`/admin/members/${keep.id}/merge`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page), "merge: picker").toEqual([])

    const searchBox = page.getByLabel("Rechercher un membre par nom ou email")
    await waitForHydration(searchBox)
    await searchBox.fill(lastName)
    await page.getByRole("button", { name: "Chercher", exact: true }).click()
    await page.getByRole("button", { name: new RegExp(`Fusionner avec cette fiche.*Jean ${lastName}`) }).click()
    await expect(page.getByRole("heading", { name: /^Aperçu de la fusion/ })).toBeVisible()
    expect.soft(await seriousViolations(page), "merge: preview").toEqual([])

    await page.getByRole("button", { name: "Fusionner les deux fiches" }).click()
    await expect(page.getByRole("alertdialog", { name: "Confirmer la fusion" })).toBeVisible()
    expect.soft(await seriousViolations(page), "merge: confirm dialog").toEqual([])
  })

  // #601: the possible-duplicates list, with a pair of homonyms to show.
  test("possible duplicates page has no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events/)

    const post = async (url: string, body: unknown) => {
      const res = await page.request.post(url, { data: body })
      expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
      return res.json()
    }
    const suffix = Date.now()
    const lastName = `A11yDup${suffix}`
    await post("/api/admin/members", { firstName: "Alix", lastName, email: `alix-a11y-a-${suffix}@example.com` })
    await post("/api/admin/members", { firstName: "Alix", lastName, email: `alix-a11y-b-${suffix}@example.com` })

    await page.goto("/admin/members/duplicates")
    await expect(page.getByRole("heading", { name: "Doublons possibles" })).toBeVisible()
    await expect(page.getByText(new RegExp(`Alix ${lastName} et Alix ${lastName}`)).first()).toBeVisible()
    expect.soft(await seriousViolations(page), "possible duplicates").toEqual([])
  })
})

test.describe("super admin", () => {
  // Seeds a known-newer release so the banner (#612) is on screen during the scan — cheap via
  // the same script as e2e/release-banner.spec.ts, no network call.
  const LATEST_VERSION = "v999.0.0"
  test.beforeAll(() => {
    execFileSync("npx", ["tsx", "scripts/e2e-seed-release-check.ts", "seed", LATEST_VERSION, `https://github.com/pvollenweider/benevoles/releases/tag/${LATEST_VERSION}`], { stdio: "inherit" })
    // A previous run (or e2e/release-banner.spec.ts) may have left this version dismissed for the
    // super admin: reset it so the banner is actually on screen for this scan.
    execFileSync("npx", ["tsx", "scripts/e2e-seed-release-check.ts", "reset-dismissed", SUPER_ADMIN_EMAIL], { stdio: "inherit" })
  })
  test.afterAll(() => {
    execFileSync("npx", ["tsx", "scripts/e2e-seed-release-check.ts", "clear"], { stdio: "inherit" })
  })

  test("organizations and health pages, with the release banner shown, have no serious violation", async ({ page }) => {
    await page.goto("/admin/login")
    await page.getByLabel("Email").fill(SUPER_ADMIN_EMAIL)
    await page.getByLabel("Mot de passe").fill(SUPER_ADMIN_PASSWORD)
    await page.getByRole("button", { name: "Se connecter" }).click()
    await expect(page).toHaveURL(/\/admin\/events|\/super-admin\/organizations/)

    await page.goto("/super-admin/organizations")
    await expect(page.getByRole("region", { name: "Nouvelle version disponible" })).toBeVisible()
    expect.soft(await seriousViolations(page), "organizations").toEqual([])

    await page.goto("/super-admin/health")
    await expect(page.getByRole("region", { name: "Nouvelle version disponible" })).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    expect.soft(await seriousViolations(page), "health").toEqual([])

    // #646: answers to « Cette vidéo vous a-t-elle été utile ? », per video and revision.
    await page.goto("/super-admin/video-feedback")
    await expect(page.getByRole("heading", { level: 1, name: "Avis sur les vidéos" })).toBeVisible()
    expect.soft(await seriousViolations(page), "video feedback").toEqual([])
  })
})
