// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Documentation screenshots (#497): every image of GUIDE_ADMIN.md and guide/*.md, written
 * to public/doc-img/ (served as /doc-img/… by /doc). Reproducible: run against a local stack
 * seeded with the demo event (scripts/seed-demo.ts), never against production.
 *
 *   1. A throwaway Postgres, e.g. `docker run -d -p 55432:5432 … postgres:16-alpine`.
 *   2. DATABASE_URL, AUTH_SECRET, ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD and
 *      NEXT_PUBLIC_APP_URL=http://localhost:3200 in the environment.
 *   3. npx prisma migrate deploy && npx tsx prisma/seed.ts && npx tsx scripts/seed-demo.ts
 *      && npx tsx scripts/seed-demo-permanences.ts && npx tsx scripts/seed-demo-day-of.ts
 *      (the last one dates its shifts around the current hour: run it again right before
 *      the shots if an hour or more has passed, and capture during the day)
 *   4. npx next dev -p 3200    (from a checkout with its own node_modules: Turbopack refuses a
 *      symlinked one)
 *   5. BASE_URL=http://localhost:3200 npm run screenshots
 *
 * Only some shots:  ONLY=admin-dashboard,public-timeline npm run screenshots
 * Each shot is independent: a failure is reported, the others still run, the exit code is 1.
 */

import { chromium } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../public/doc-img")

const BASE = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "")
const ORG = process.env.DEMO_ORG ?? "default"
const EVENT_SLUG = "fete-du-village"
// Fixed in scripts/seed-demo.ts (demo database only).
const TOKENS = { volunteer: "demo-volunteer-camille-0001", leader: "demo-leader-buvette-0001" }
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: "fr-CH", timezoneId: "Europe/Zurich" }
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "fr-CH", timezoneId: "Europe/Zurich" }

const withOrg = (p) => `${BASE}${p}${p.includes("?") ? "&" : "?"}org=${ORG}`

async function settle(page) {
  await page.waitForLoadState("networkidle")
  // The dev server's floating indicator isn't part of the product.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  // The timeline measures its card once mounted.
  await page.waitForTimeout(500)
}

/** Screenshot of the viewport, of the full page, or of one element. */
async function save(page, name, { target, fullPage = false } = {}) {
  const file = path.join(OUT, `${name}.png`)
  if (target) await target.screenshot({ path: file })
  else await page.screenshot({ path: file, fullPage })
  console.log(`  ✓ ${name}.png`)
}

const failures = []
async function shot(name, fn) {
  if (ONLY && !ONLY.has(name)) return
  try {
    await fn()
  } catch (e) {
    failures.push(name)
    console.error(`  ✗ ${name}: ${String(e.message).split("\n")[0]}`)
  }
}

/** Signs in as `email` (the demo password) and returns the id of the event titled `title` (default: the first one). */
async function signIn(browser, { email = ORG_ADMIN_EMAIL, device = DESKTOP, title, seed = "scripts/seed-demo.ts" } = {}) {
  if (!ORG_ADMIN_PASSWORD) throw new Error("ORG_ADMIN_PASSWORD is required for the admin screenshots")
  const context = await browser.newContext(device)
  const page = await context.newPage()
  await page.goto(`${BASE}/admin/login`)
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await page.waitForURL(/\/admin\/(events|dashboard)/)
  await page.goto(`${BASE}/admin/events`)
  await settle(page)
  const link = title ? page.getByRole("link", { name: `Dupliquer ${title}`, exact: true }) : page.getByRole("link", { name: /^Gérer/ })
  const href = await link.first().getAttribute("href")
  const eventId = href?.match(/\/admin\/events\/([^/?#]+)/)?.[1]
  if (!eventId) throw new Error(`demo event not found: run ${seed} first`)
  return { context, page, eventId }
}

const adminSession = (browser) => signIn(browser)

async function run() {
  // French browser process too: native date fields show day before month (AGENTS.md).
  const browser = await chromium.launch({ args: ["--lang=fr-CH"], env: { ...process.env, LANG: "fr_CH.UTF-8", LC_ALL: "fr_CH.UTF-8" } })

  // ── What volunteers see ──────────────────────────────────────────────────
  console.log("Public pages…")
  const desk = await browser.newContext(DESKTOP)
  const p = await desk.newPage()

  await shot("public-timeline", async () => {
    await p.goto(withOrg(`/${EVENT_SLUG}`))
    await settle(p)
    await save(p, "public-timeline")
  })

  await shot("public-selection", async () => {
    await p.goto(withOrg(`/${EVENT_SLUG}`))
    await settle(p)
    await p.getByRole("button", { name: /^09h–12h .*Accueil : sélectionner/ }).first().click()
    await p.getByRole("button", { name: /^14h–18h .*Navette \(Chauffeur navette\).*: sélectionner/ }).first().click()
    await save(p, "public-selection")
  })

  await shot("public-registration-birthdate", async () => {
    // Continues from the selection above: the navette asks for a minimum age.
    await p.getByRole("button", { name: /^Continuer/ }).first().click()
    await settle(p)
    const field = p.getByLabel(/naissance/i).first()
    // The form heading and the field both in view, the field in the lower half.
    await field.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 520))
    await save(p, "public-registration-birthdate")
  })

  // Share link per group (#947): the demo's « Amicale des pompiers » link (fixed code, seed-demo.ts).
  await shot("public-group-link", async () => {
    await p.goto(withOrg(`/${EVENT_SLUG}?groupe=pmpr2345`))
    await settle(p)
    await save(p, "public-group-link")
  })

  await shot("public-my-page", async () => {
    await p.goto(withOrg(`/my/${TOKENS.volunteer}`))
    await settle(p)
    await save(p, "public-my-page")
  })

  await shot("leader-page", async () => {
    await p.goto(withOrg(`/leader/${TOKENS.leader}`))
    await settle(p)
    await save(p, "leader-page")
  })
  // A full shift with a waitlist: the bar stays clickable, the selection says it is a waitlist.
  // A fresh context: the selection of the shots above is kept by the browser.
  await shot("public-waitlist-selection", async () => {
    const fresh = await browser.newContext(DESKTOP)
    const w = await fresh.newPage()
    await w.goto(withOrg(`/${EVENT_SLUG}`))
    await settle(w)
    await w.getByRole("button", { name: /^14h–18h .*Buvette : rejoindre la file d.attente/ }).first().click()
    await save(w, "public-waitlist-selection")
    await fresh.close()
  })

  // The « Ton lien personnel » box of the personal page, and the page of a link that no longer works.
  await shot("public-personal-link", async () => {
    await p.goto(withOrg(`/my/${TOKENS.volunteer}`))
    await settle(p)
    await save(p, "public-personal-link", { target: p.getByRole("region", { name: "Ton lien personnel" }) })
  })
  // « Mes réponses » (#984): the volunteer's answers to the event's questions, under the registrations.
  await shot("public-my-answers", async () => {
    await p.goto(withOrg(`/my/${TOKENS.volunteer}`))
    await settle(p)
    await save(p, "public-my-answers", { target: p.getByRole("region", { name: "Mes réponses" }) })
  })
  await shot("public-link-invalid", async () => {
    await p.goto(withOrg("/my/demo-unknown-link-0000"))
    await settle(p)
    await save(p, "public-link-invalid", { target: p.getByRole("heading", { name: "Ce lien ne fonctionne pas" }).locator("xpath=..") })
  })

  // « Demander un espace »: the form only, without the site footer.
  await shot("public-signup", async () => {
    await p.goto(`${BASE}/inscription`)
    await settle(p)
    await save(p, "public-signup", { target: p.locator("main") })
  })
  await desk.close()

  await shot("public-timeline-mobile", async () => {
    const mob = await browser.newContext(MOBILE)
    const m = await mob.newPage()
    await m.goto(withOrg(`/${EVENT_SLUG}`))
    await settle(m)
    await save(m, "public-timeline-mobile")
    await mob.close()
  })

  // A season of weekly permanences (#866, #872), on a phone: the month buttons and the first
  // dates. Needs scripts/seed-demo-permanences.ts (its own organisation, « Épicerie de la Gare »).
  await shot("public-permanences-mobile", async () => {
    const mob = await browser.newContext(MOBILE)
    const m = await mob.newPage()
    await m.goto(`${BASE}/saison-automne?org=epicerie-de-la-gare`)
    await settle(m)
    await save(m, "public-permanences-mobile")
    await mob.close()
  })

  if (process.env.PUBLIC_ONLY) return finish(browser)

  // ── Administration ───────────────────────────────────────────────────────
  console.log("Administration…")
  const { context, page: a, eventId } = await adminSession(browser)
  const ev = (suffix = "") => `${BASE}/admin/events/${eventId}${suffix}`
  const visit = async (url) => { await a.goto(url); await settle(a) }

  await shot("admin-dashboard", async () => { await visit(`${BASE}/admin/dashboard`); await save(a, "admin-dashboard") })
  await shot("admin-event-overview", async () => { await visit(ev()); await save(a, "admin-event-overview") })
  await shot("admin-group-links", async () => {
    await visit(ev("/share"))
    await save(a, "admin-group-links", { target: a.getByRole("main") })
  })
  // « Intégrer à votre site » (#948), opened: options, code, copy and preview buttons, instructions.
  await shot("admin-embed", async () => {
    await visit(ev("/share"))
    const section = a.getByRole("region", { name: "Liens par groupe et intégration" })
    await section.getByRole("button", { name: "Code d'intégration" }).click()
    const panel = section.getByRole("heading", { name: "Intégrer à votre site" }).locator("xpath=../..")
    await save(a, "admin-embed", { target: panel })
  })
  await shot("admin-staffing", async () => { await visit(ev("/staffing")); await save(a, "admin-staffing") })
  await shot("admin-shifts", async () => { await visit(ev("/shifts")); await save(a, "admin-shifts") })
  await shot("admin-registrations", async () => { await visit(ev("/registrations")); await save(a, "admin-registrations") })
  await shot("admin-registrations-requests", async () => { await visit(ev("/registrations?demandes=1")); await save(a, "admin-registrations-requests") })

  await shot("admin-refuse-request", async () => {
    await visit(ev("/registrations?demandes=1"))
    await a.getByRole("button", { name: /^Refuser la demande de/ }).first().click()
    const dialog = a.getByRole("alertdialog")
    await dialog.getByLabel(/Message à la personne/).fill("Merci ! Les deux places de chauffeur sont déjà prises ce matin-là.")
    await save(a, "admin-refuse-request", { target: dialog })
    await dialog.getByRole("button", { name: "Annuler" }).click()
  })

  await shot("admin-make-leader-modal", async () => {
    await visit(ev("/registrations"))
    await a.getByRole("checkbox", { name: /Sélectionner l.inscription de Camille Rochat/ }).first().check()
    await a.getByRole("button", { name: "Rendre responsable" }).click()
    const dialog = a.getByRole("dialog")
    await dialog.waitFor()
    await save(a, "admin-make-leader-modal", { target: dialog })
    await a.keyboard.press("Escape")
  })

  await shot("admin-sector-leaders", async () => { await visit(ev("/sector-leaders")); await save(a, "admin-sector-leaders") })
  await shot("admin-questions", async () => { await visit(ev("/questions")); await save(a, "admin-questions") })
  await shot("admin-pages", async () => { await visit(ev("/pages")); await save(a, "admin-pages") })
  await shot("admin-message", async () => { await visit(ev("/message")); await save(a, "admin-message") })
  await shot("admin-print", async () => { await visit(ev("/print")); await save(a, "admin-print") })
  await shot("admin-members", async () => { await visit(`${BASE}/admin/members`); await save(a, "admin-members") })

  await shot("admin-member-activity", async () => {
    await visit(`${BASE}/admin/members`)
    await a.getByRole("link", { name: "Activité de Camille Rochat" }).click()
    await a.waitForURL(/\/admin\/members\/[^/]+$/)
    await settle(a)
    await a.evaluate(() => window.scrollTo(0, 0))
    await save(a, "admin-member-activity")
  })

  await shot("admin-event-review", async () => {
    await visit(ev("/review"))
    await save(a, "admin-event-review", { target: a.getByRole("region", { name: "Vérification" }) })
  })
  // « Créer une série », filled like the guide's example (a bar from 10 h to 22 h, two-hour shifts,
  // three people each): the preview lists the shifts. Nothing is created.
  await shot("admin-shift-series", async () => {
    await visit(ev("/shifts"))
    await a.getByRole("button", { name: "Créer une série" }).click()
    const form = a.getByRole("region", { name: "Créer une série de créneaux" })
    await form.getByRole("combobox", { name: "Poste" }).fill("Buvette")
    await form.getByRole("combobox", { name: "Date" }).selectOption({ index: 2 })
    await form.getByRole("textbox", { name: "Début" }).fill("10:00")
    await form.getByRole("textbox", { name: "Fin" }).fill("22:00")
    await form.getByRole("spinbutton", { name: "Places par créneau" }).fill("3")
    await form.getByRole("checkbox", { name: "Activer la liste d'attente" }).check()
    await a.evaluate(() => document.activeElement?.blur())
    await a.waitForTimeout(300)
    await save(a, "admin-shift-series", { target: form })
  })
  await shot("admin-invitations", async () => { await visit(ev("/invitations")); await save(a, "admin-invitations") })
  await shot("admin-reminders", async () => {
    await visit(ev("/message"))
    await save(a, "admin-reminders", { target: a.getByRole("region", { name: "Rappels automatiques activés" }) })
  })
  await shot("admin-event-archive", async () => {
    await visit(ev("/print"))
    await save(a, "admin-event-archive", { target: a.getByRole("region", { name: "Archive" }) })
  })

  await context.close()

  // ── Permanences and Jour J: « Épicerie de la Gare » (scripts/seed-demo-permanences.ts and
  //    scripts/seed-demo-day-of.ts), signed in as its organizer ─────────────────
  const epicerie = { email: "epicerie.admin@example.org", seed: "scripts/seed-demo-permanences.ts" }
  const season = ONLY && !["admin-recurrence-form", "admin-recurrences"].some((n) => ONLY.has(n)) ? null : await signIn(browser, { ...epicerie, title: "Saison d'automne" })
  if (season) {
    const shifts = `${BASE}/admin/events/${season.eventId}/shifts`
    // « Répéter chaque semaine », filled: a Friday afternoon reception, Swiss holidays excluded
    // (Christmas and New Year's Day of the 2026–2027 season fall on a Friday), and the second
    // Friday closed (the season starts on a Monday).
    await shot("admin-recurrence-form", async () => {
      await season.page.goto(shifts)
      await settle(season.page)
      await season.page.getByRole("button", { name: "Répéter chaque semaine" }).click()
      const form = season.page.getByRole("region", { name: "Répéter un créneau chaque semaine" })
      await form.getByRole("combobox", { name: "Poste" }).fill("Accueil")
      await form.getByRole("checkbox", { name: "vendredi" }).check()
      await form.getByRole("textbox", { name: "Début" }).fill("14:00")
      await form.getByRole("textbox", { name: "Fin" }).fill("17:00")
      const from = await form.getByRole("textbox", { name: "Du" }).inputValue()
      const closed = new Date(Date.parse(`${from}T00:00:00Z`) + 11 * 86_400_000).toISOString().slice(0, 10)
      await form.getByLabel("Fermetures (vacances, jours sans permanence)").fill(closed)
      await form.getByRole("button", { name: "Ajouter la date" }).click()
      await season.page.evaluate(() => document.activeElement?.blur())
      await season.page.waitForTimeout(300)
      await save(season.page, "admin-recurrence-form", { target: form })
    })
    await shot("admin-recurrences", async () => {
      await season.page.goto(shifts)
      await settle(season.page)
      await save(season.page, "admin-recurrences", { target: season.page.getByRole("region", { name: "Permanences récurrentes" }) })
    })
    await season.context.close()
  }

  // « Jour J » on a phone, as on site: the first screen, the running shift with one person marked.
  await shot("admin-day-of", async () => {
    const dayOf = await signIn(browser, { ...epicerie, device: MOBILE, title: "Inventaire d'automne", seed: "scripts/seed-demo-day-of.ts" })
    await dayOf.page.goto(`${BASE}/admin/events/${dayOf.eventId}/day-of`)
    await settle(dayOf.page)
    await save(dayOf.page, "admin-day-of")
    await dayOf.context.close()
  })

  return finish(browser)
}

async function finish(browser) {
  await browser.close()
  if (failures.length > 0) {
    console.error(`\n${failures.length} screenshot(s) failed: ${failures.join(", ")}`)
    process.exit(1)
  }
  console.log(`\nDone — ${OUT}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
