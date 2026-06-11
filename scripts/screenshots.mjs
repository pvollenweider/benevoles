/**
 * Screenshot generator for Benevol documentation.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@org.com ADMIN_PASSWORD=xxx node scripts/screenshots.mjs
 *
 * Optional env vars:
 *   BASE_PUBLIC   default: https://www.benevol.app
 *   BASE_ADMIN    default: https://cdp.benevol.app   (org subdomain)
 */

import { chromium } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../docs/screenshots")

const BASE_PUBLIC = process.env.BASE_PUBLIC ?? "https://www.benevol.app"
const BASE_ADMIN  = process.env.BASE_ADMIN  ?? "https://cdp.benevol.app"
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? "admin@localhost"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me"

const DESKTOP = { width: 1440, height: 900 }
const MOBILE  = { width: 390,  height: 844, isMobile: true, hasTouch: true }

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 800)
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: opts.fullPage ?? false,
    clip: opts.clip,
  })
  console.log(`  ✓ ${name}.png`)
}

async function run() {
  const browser = await chromium.launch()

  // ── 1. Landing page (www.benevol.app) ─────────────────────────────────────
  console.log("\n1. Landing page…")
  const pub = await browser.newPage()
  await pub.setViewportSize(DESKTOP)
  await pub.goto(BASE_PUBLIC, { waitUntil: "networkidle" })
  await shot(pub, "01-landing", { fullPage: true })

  const mob = await browser.newPage()
  await mob.setViewportSize(MOBILE)
  await mob.goto(BASE_PUBLIC, { waitUntil: "networkidle" })
  await shot(mob, "02-landing-mobile")
  await mob.close()
  await pub.close()

  // ── 2. Public registration timeline ───────────────────────────────────────
  console.log("\n2. Public timeline…")
  const tl = await browser.newPage()
  await tl.setViewportSize(DESKTOP)
  await tl.goto(BASE_ADMIN, { waitUntil: "networkidle" })
  const eventHref = await tl.locator("a[class*='rounded']").first().getAttribute("href")
  if (eventHref) {
    const eventUrl = eventHref.startsWith("http") ? eventHref : `${BASE_ADMIN}${eventHref}`
    console.log(`  → event: ${eventUrl}`)
    await tl.goto(eventUrl, { waitUntil: "networkidle" })
    await shot(tl, "03-timeline-desktop", { fullPage: true, wait: 1200 })

    const tlm = await browser.newPage()
    await tlm.setViewportSize(MOBILE)
    await tlm.goto(eventUrl, { waitUntil: "networkidle" })
    await shot(tlm, "04-timeline-mobile", { fullPage: true, wait: 1200 })
    await tlm.close()
  } else {
    console.log("  ⚠ No published event found — skipping timeline screenshots")
  }
  await tl.close()

  // ── 3. Admin pages ─────────────────────────────────────────────────────────
  console.log("\n3. Admin pages…")
  const adm = await browser.newPage()
  await adm.setViewportSize(DESKTOP)

  await adm.goto(`${BASE_ADMIN}/admin/login`, { waitUntil: "networkidle" })
  await shot(adm, "05-admin-login")
  await adm.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await adm.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await adm.getByRole("button", { name: /connecter/i }).click()
  await adm.waitForURL(/\/admin/, { timeout: 15000 })
  await adm.waitForLoadState("networkidle")

  // Dashboard
  await adm.goto(`${BASE_ADMIN}/admin/dashboard`, { waitUntil: "networkidle" })
  await shot(adm, "06-admin-dashboard", { wait: 1000, fullPage: true })

  // Events list
  await adm.goto(`${BASE_ADMIN}/admin/events`, { waitUntil: "networkidle" })
  await shot(adm, "07-admin-events", { wait: 800 })

  // Event detail — find first event link
  const firstEventLink = adm.locator("a[href*='/admin/events/']").first()
  let eventId = null
  if (await firstEventLink.count() > 0) {
    const href = await firstEventLink.getAttribute("href")
    eventId = href?.match(/\/admin\/events\/([^/?]+)/)?.[1]
    if (eventId) {
      console.log(`  → event id: ${eventId}`)
      await adm.goto(`${BASE_ADMIN}/admin/events/${eventId}`, { waitUntil: "networkidle" })
      await shot(adm, "08-admin-event-detail", { wait: 1000, fullPage: true })

      // Shifts
      await adm.goto(`${BASE_ADMIN}/admin/events/${eventId}/shifts`, { waitUntil: "networkidle" })
      await shot(adm, "09-admin-shifts", { fullPage: true, wait: 1200 })

      // Registrations
      await adm.goto(`${BASE_ADMIN}/admin/events/${eventId}/registrations`, { waitUntil: "networkidle" })
      await shot(adm, "10-admin-registrations", { fullPage: true, wait: 1000 })

      // Invitations
      await adm.goto(`${BASE_ADMIN}/admin/events/${eventId}/invitations`, { waitUntil: "networkidle" })
      await shot(adm, "11-admin-invitations", { fullPage: true, wait: 1000 })

      // PDF export (higher resolution)
      const pdf = await browser.newPage()
      await pdf.setViewportSize({ width: 1440, height: 900 })
      await pdf.context().addCookies(await adm.context().cookies())
      await pdf.goto(`${BASE_ADMIN}/api/admin/events/${eventId}/export/pdf`, { waitUntil: "networkidle" })
      await shot(pdf, "12-export-pdf", { fullPage: true, wait: 1200 })
      await pdf.close()
    }
  }

  // Members
  await adm.goto(`${BASE_ADMIN}/admin/members`, { waitUntil: "networkidle" })
  await shot(adm, "13-admin-members", { fullPage: true, wait: 800 })

  // Settings
  await adm.goto(`${BASE_ADMIN}/admin/settings/admins`, { waitUntil: "networkidle" })
  await shot(adm, "14-admin-settings", { fullPage: true, wait: 800 })

  await adm.close()
  await browser.close()
  console.log(`\nDone — ${OUT}\n`)
}

run().catch(err => { console.error(err); process.exit(1) })
