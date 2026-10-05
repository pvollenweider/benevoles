// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Generates actual app print documents, not imitation layouts. PDF visual QA is separate. */
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const event = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "festival-des-documents" }, include: { registrations: { where: { status: "active" }, include: { volunteer: true, shift: true } } } })
    const ids = new Set(event.registrations.map(r => r.volunteerId))
    if (ids.size !== 80 || event.registrations.length !== 84) throw new Error("Document seed required")
    const directory = "videos/output/volunteer-badges/documents"
    await mkdir(directory, { recursive: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto(`${base}/admin/events/${event.id}/print`)
    const person = page.getByLabel("Bénévole (réimpression)", { exact: true })
    const options = await person.locator("option").allTextContents()
    const homonyms = options.filter(o => o.includes("Camille Berger"))
    if (homonyms.length !== 2 || !homonyms.some(o => o.includes("video.documents.001@example.org")) || !homonyms.some(o => o.includes("video.documents.002@example.org"))) throw new Error("Homonyms are not distinguished in actual select")
    const roleIds = new Set(event.registrations.filter(r => r.shift.roleName === "Buvette").map(r => r.volunteerId))
    const variants = [
      { name: "all", role: "", volunteer: "", color: "role", lastName: true, shifts: true, expected: 80 },
      { name: "buvette", role: "Buvette", volunteer: "", color: "role", lastName: true, shifts: true, expected: roleIds.size },
      { name: "camille-second", role: "", volunteer: "video-document-person-2", color: "role", lastName: true, shifts: true, expected: 1 },
      { name: "lea-five-shifts", role: "", volunteer: "video-document-person-0", color: "role", lastName: true, shifts: true, expected: 1 },
      { name: "empty-combined", role: "Loge", volunteer: "video-document-person-1", color: "role", lastName: true, shifts: true, expected: 0 },
      { name: "event-color", role: "", volunteer: "", color: "event", lastName: true, shifts: true, expected: 80 },
      { name: "black-white", role: "", volunteer: "", color: "none", lastName: true, shifts: true, expected: 80 },
      { name: "minimal", role: "", volunteer: "video-document-person-0", color: "role", lastName: false, shifts: false, expected: 1 },
      { name: "loge-fallback", role: "Loge", volunteer: "", color: "role", lastName: true, shifts: true, expected: new Set(event.registrations.filter(r => r.shift.roleName === "Loge").map(r => r.volunteerId)).size },
    ]
    const results = []
    for (const variant of variants) {
      await page.getByLabel("Poste", { exact: true }).selectOption(variant.role)
      await person.selectOption(variant.volunteer)
      await page.getByLabel("Couleur du bandeau", { exact: true }).selectOption(variant.color)
      await page.getByRole("checkbox", { name: "Nom de famille", exact: true }).setChecked(variant.lastName)
      await page.getByRole("checkbox", { name: "Créneaux", exact: true }).setChecked(variant.shifts)
      const popupPromise = page.waitForEvent("popup")
      await page.getByRole("button", { name: /^Ouvrir les badges/ }).click()
      const document = await popupPromise
      await document.waitForLoadState("networkidle")
      await document.evaluate(() => globalThis.document.fonts.ready)
      const url = new URL(document.url())
      if (url.searchParams.get("volunteer") !== variant.volunteer || url.searchParams.get("role") !== variant.role) throw new Error("Generated document does not match selected identity")
      if (await document.locator(".badge").count() !== variant.expected) throw new Error(`Wrong badge count: ${variant.name}`)
      const sheetCounts = await document.locator(".sheet").evaluateAll(sheets => sheets.map(s => s.querySelectorAll(".badge").length))
      if (sheetCounts.length !== Math.ceil(variant.expected / 10) || sheetCounts.some(n => n > 10)) throw new Error("Wrong sheet grouping")
      const body = await document.locator("main").innerText()
      if (/example\.org|\/my\/|demo-documents|Demande Témoin|Attente Témoin|Annulée Témoin/.test(body)) throw new Error("Private identifiers or excluded witnesses printed")
      if (variant.name === "lea-five-shifts" && (await document.locator(".shifts > li").count() !== 5 || !body.includes("+ 1 autre"))) throw new Error("Five shifts are not abbreviated correctly")
      if (variant.name === "minimal" && (await document.locator(".last, .shifts").count() || !body.includes("Léa"))) throw new Error("Minimal fields incorrect")
      if (variant.expected === 0 && !body.includes("Tous les postes")) throw new Error("Empty selection explanation missing")
      const colors = await document.locator(".band").evaluateAll(bands => [...new Set(bands.map(b => getComputedStyle(b).backgroundColor))])
      if (variant.name === "event-color" && colors.length !== 1) throw new Error("Event color is not uniform")
      if (["event-color", "loge-fallback"].includes(variant.name) && (colors.length !== 1 || colors[0] !== "rgb(20, 71, 230)")) throw new Error("Expected blue event color or fallback")
      if (variant.name === "black-white" && (colors.length !== 1 || colors[0] !== "rgb(17, 17, 17)")) throw new Error("Monochrome bands are not black")
      if (variant.name === "all" && (colors.length !== 2 || !colors.includes("rgb(151, 60, 0)") || !colors.includes("rgb(20, 71, 230)"))) throw new Error("Role colors not applied")
      const pdf = path.join(directory, `${variant.name}.pdf`)
      await document.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true })
      await document.screenshot({ path: path.join(directory, `${variant.name}-screen.png`), fullPage: false })
      results.push({ variant: variant.name, badges: variant.expected, sheetCounts, colors, pdf })
      await document.close()
    }
    const report = { checkedAt: new Date().toISOString(), scope: "actual form, routes, DOM and generated PDFs; PDF pagination and visual review not yet verified", pdfVisualReview: false, homonymsDistinguished: true, activePeople: ids.size, results }
    await writeFile(path.join(directory, "badge-preflight.json"), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await browser.close(); await db.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
