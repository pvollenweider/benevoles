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

async function adminSession(browser) {
  if (!ORG_ADMIN_PASSWORD) throw new Error("ORG_ADMIN_PASSWORD is required for the admin screenshots")
  const context = await browser.newContext(DESKTOP)
  const page = await context.newPage()
  await page.goto(`${BASE}/admin/login`)
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await page.waitForURL(/\/admin\/(events|dashboard)/)
  await page.goto(`${BASE}/admin/events`)
  await settle(page)
  const href = await page.getByRole("link", { name: /^Gérer/ }).first().getAttribute("href")
  const eventId = href?.match(/\/admin\/events\/([^/?#]+)/)?.[1]
  if (!eventId) throw new Error("demo event not found: run scripts/seed-demo.ts first")
  return { context, page, eventId }
}

async function run() {
  const browser = await chromium.launch()

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
    await p.getByRole("button", { name: /^Sélectionner — Accueil 09/ }).first().click()
    await p.getByRole("button", { name: /^Sélectionner — Navette \(Chauffeur navette\) 14/ }).first().click()
    await save(p, "public-selection")
  })

  await shot("public-registration-birthdate", async () => {
    // Continues from the selection above: the navette asks for a minimum age.
    await p.getByRole("button", { name: /^Continuer/ }).first().click()
    await settle(p)
    const field = p.getByLabel(/naissance/i).first()
    await field.scrollIntoViewIfNeeded()
    await save(p, "public-registration-birthdate")
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
  await desk.close()

  await shot("public-timeline-mobile", async () => {
    const mob = await browser.newContext(MOBILE)
    const m = await mob.newPage()
    await m.goto(withOrg(`/${EVENT_SLUG}`))
    await settle(m)
    await save(m, "public-timeline-mobile")
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
    await save(a, "admin-member-activity")
  })

  await context.close()
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
