// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Read-only screenshots of the real main build, not substitutes for recordings. */
import { chromium } from "playwright"
import { mkdir, writeFile } from "node:fs/promises"
import { verifyProductBuild } from "../lib/product-build"

async function main() {
  const base = "http://localhost:43102"
  const product = await verifyProductBuild(base)
  const directory = "videos/output/main-ui-baseline"
  await mkdir(directory, { recursive: true })
  const browser = await chromium.launch({ headless: true, args: ["--lang=fr-FR"], env: { ...process.env, LANG: "fr_FR.UTF-8", LC_ALL: "fr_FR.UTF-8" } })
  const context = await browser.newContext({ locale: "fr-FR", timezoneId: "Europe/Zurich", viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" })
  const page = await context.newPage()
  const rows: { name: string; route: string; status: number; headings: string[]; screenshot: string; controls: string[] }[] = []
  try {
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email").fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe").fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.getByRole("link", { name: "Fête du village de Montvert", exact: true }).first().waitFor()
    const eventHref = await page.getByRole("link", { name: "Fête du village de Montvert", exact: true }).first().getAttribute("href")
    if (!eventHref || !/^\/admin\/events\/[a-z0-9-]+$/i.test(eventHref)) throw new Error("Known synthetic event link required")
    const eventId = eventHref.split("/").at(-1)!
    const routes: [string, string][] = [["events", "/admin/events"], ["event", eventHref], ["shifts", `${eventHref}/shifts`], ["reports", `${eventHref}/print`], ["registrations", `${eventHref}/registrations`], ["questions", `${eventHref}/questions`], ["day-of", `${eventHref}/day-of`], ["review", `${eventHref}/review`], ["edit", `${eventHref}/edit`], ["pages", `${eventHref}/pages`], ["milestones-context", eventHref], ["invitations", `${eventHref}/invitations`], ["messages", `${eventHref}/message`], ["leaders", `${eventHref}/sector-leaders`], ["staffing", `${eventHref}/staffing`], ["open-shifts", `${eventHref}/staffing/search`], ["duplicate", `${eventHref}/duplicate`], ["event-log", `${eventHref}/log`], ["members", "/admin/members"], ["duplicates", "/admin/members/duplicates"], ["settings-team", "/admin/settings/admins"], ["settings-email", "/admin/settings/notifications"], ["settings-templates", "/admin/settings/message-templates"], ["org-log", "/admin/settings/activity"], ["search", "/admin/search?q=buvette"], ["account", "/admin/account"], ["public-event", "/fete-du-village?org=default"], ["documentation", "/doc/admin"]]
    for (const [name, route] of routes) {
      const response = await page.goto(`${base}${route}`)
      await page.waitForLoadState("networkidle")
      const status = response?.status() ?? 0
      if (status !== 200 || page.url().includes("/admin/login")) throw new Error(`${name}: actual page not reachable (HTTP ${status})`)
      const headings = await page.locator("h1,h2,h3").allTextContents()
      const controls = await page.locator("button,a[href],label,summary").allTextContents()
      if (name === "shifts") {
        await page.getByRole("button", { name: "Frise", exact: true }).waitFor()
        if (await page.getByRole("button", { name: "Timeline", exact: true }).count()) throw new Error("Old Timeline label in target build")
      }
      if (name === "reports") {
        const sections = await page.locator("section > h2").allTextContents()
        const expected = ["À afficher ou à remettre aux bénévoles", "Pour les organisateurs seulement", "Badges", "Résumé de l'événement", "Archive"]
        if (JSON.stringify(sections) !== JSON.stringify(expected)) throw new Error("Report section order differs from current main source")
        await page.getByRole("link", { name: /^Synthèse des réponses/ }).waitFor()
        await page.getByRole("heading", { name: "Pour les organisateurs seulement", exact: true }).scrollIntoViewIfNeeded()
      }
      const screenshot = `${directory}/${name}.png`
      await page.screenshot({ path: screenshot, fullPage: true })
      rows.push({ name, route, status, headings, screenshot, controls: controls.map(text => text.trim()).filter(Boolean) })
      await writeFile(`${directory}/review.json`, JSON.stringify({ product, eventId, note: "Real read-only main UI screenshots; no complete video, keyboard, voice or result validation implied", pages: rows }, null, 2))
      console.log(`${name}: main ${product.commit.slice(0, 8)}, HTTP ${status}`)
    }
  } finally { await context.close(); await browser.close() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Main UI review failed"); process.exitCode = 1 })
