import { chromium } from "playwright"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, "../docs/screenshots")
const BASE = "https://benevoles.gallerypack.app"

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? "admin@benevoles.fr"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123"

const DESKTOP = { width: 1440, height: 900 }
const MOBILE  = { width: 390, height: 844, isMobile: true, hasTouch: true }

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

  /* ── 1. Public pages ─────────────────────────────────── */
  console.log("\nPublic pages…")
  const pub = await browser.newPage()
  await pub.setViewportSize(DESKTOP)

  // Home – event list
  await pub.goto(BASE, { waitUntil: "networkidle" })
  await shot(pub, "01-home")

  // Find the first event link
  const eventLink = await pub.locator("a[href*='/events/']").first().getAttribute("href")
  console.log(`  → event: ${eventLink}`)

  // Public timeline – desktop
  await pub.goto(`${BASE}${eventLink}`, { waitUntil: "networkidle" })
  await shot(pub, "02-timeline-desktop", { fullPage: true })

  // Public timeline – mobile
  const mob = await browser.newPage()
  await mob.setViewportSize(MOBILE)
  await mob.goto(`${BASE}${eventLink}`, { waitUntil: "networkidle" })
  await shot(mob, "03-timeline-mobile", { fullPage: true })
  await mob.close()

  // Registration form (click a shift)
  await pub.setViewportSize(DESKTOP)
  await pub.goto(`${BASE}${eventLink}`, { waitUntil: "networkidle" })
  const openShift = pub.locator("button[class*='cursor-pointer']").first()
  if (await openShift.count() > 0) {
    await openShift.click()
    await shot(pub, "04-register-form", { wait: 600 })
  }

  // My registrations page (token URL — skip if not accessible)
  await pub.close()

  /* ── 2. Admin pages ─────────────────────────────────── */
  console.log("\nAdmin pages…")
  const adm = await browser.newPage()
  await adm.setViewportSize(DESKTOP)

  // Login
  await adm.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" })
  await shot(adm, "05-admin-login")
  await adm.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await adm.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await adm.getByRole("button", { name: /connecter/i }).click()
  await adm.waitForURL(/\/admin\/events/, { timeout: 15000 })
  await adm.waitForLoadState("networkidle")

  // Event list
  await shot(adm, "06-admin-events", { wait: 1000 })

  // Click "Gérer" on the published event (look for badge "Publié" in the same card)
  const publishedGerer = adm.locator("div", { hasText: /Publié/ }).locator("..").locator("a", { hasText: /Gérer/i })
  const gererLinks = adm.locator("a", { hasText: /Gérer/i })
  const count = await gererLinks.count()
  // Click the last "Gérer" (HORIZON is last in the list)
  await gererLinks.nth(count - 1).click()
  await adm.waitForURL(/\/admin\/events\/[^/]+$/, { timeout: 10000 })
  const eventId = adm.url().match(/\/admin\/events\/([^/?]+)/)?.[1]
  console.log(`  → event id: ${eventId}`)

  // Shifts manager
  await adm.goto(`${BASE}/admin/events/${eventId}/shifts`, { waitUntil: "networkidle" })
  await shot(adm, "07-admin-shifts", { fullPage: true, wait: 1200 })

  // Registrations manager
  await adm.goto(`${BASE}/admin/events/${eventId}/registrations`, { waitUntil: "networkidle" })
  await shot(adm, "08-admin-registrations", { fullPage: true, wait: 1200 })

  // Shows manager
  await adm.goto(`${BASE}/admin/events/${eventId}/shows`, { waitUntil: "networkidle" })
  await shot(adm, "09-admin-shows", { fullPage: true, wait: 800 })

  await adm.close()
  await browser.close()
  console.log(`\nDone — ${OUT}\n`)
}

run().catch(err => { console.error(err); process.exit(1) })
