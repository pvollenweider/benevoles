// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Checks the actual report links against real fixture data. No imitation document. */
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { verifyProductBuild } from "../lib/product-build"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video environment required")
  const product = await verifyProductBuild(base)
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const event = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "festival-des-documents" }, include: { registrations: { where: { status: "active" }, include: { volunteer: true, shift: true } } } })
    if (new Set(event.registrations.map(r => r.volunteerId)).size !== 80) throw new Error("Document seed required")
    const directory = "videos/output/event-reports/documents"
    await mkdir(directory, { recursive: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto(`${base}/admin/events/${event.id}/print`)
    const reports = [
      { id: "complete", label: "Export complet", suffix: "pdf", privateContacts: true },
      { id: "day", label: "Planning par jour", suffix: "sheets/day", privateContacts: false },
      { id: "role", label: "Planning par poste", suffix: "sheets/role", privateContacts: false },
      { id: "individual", label: "Planning individuel", suffix: "sheets/individual", privateContacts: false },
      { id: "attendance", label: "Feuille de présence", suffix: "sheets/attendance", privateContacts: true },
      { id: "phones", label: "Liste avec téléphones", suffix: "sheets/phones", privateContacts: true },
    ]
    const results = []
    for (const report of reports) {
      const popupPromise = page.waitForEvent("popup")
      await page.getByRole("link", { name: new RegExp(`^${report.label}`) }).click()
      const output = await popupPromise
      await output.waitForLoadState("networkidle")
      await output.evaluate(() => document.fonts.ready)
      if (!new URL(output.url()).pathname.endsWith(`/export/${report.suffix}`)) throw new Error(`Wrong report route: ${report.id}`)
      const body = await output.locator("body").innerText()
      if (!body.includes("Léa") || !body.includes("Giroud") || /Demande Témoin|Attente Témoin|Annulée Témoin/.test(body)) throw new Error(`Report persons incorrect: ${report.id}`)
      if (/\/my\/|demo-documents/.test(body)) throw new Error("Personal links printed")
      if (!report.privateContacts) {
        const privateValues = event.registrations.flatMap(r => [r.volunteer.email, r.volunteer.phone, r.phone]).filter((v): v is string => !!v)
        if (privateValues.some(value => body.includes(value))) throw new Error(`Private volunteer contact in display report: ${report.id}`)
      }
      if (report.id === "individual") {
        const sections = output.locator("section.block")
        if (await sections.count() !== 80) throw new Error("Expected one individual section per person")
        const lea = sections.filter({ has: output.getByRole("heading", { name: "Léa Giroud", exact: true }) })
        if (await lea.locator(".card").count() !== 5) throw new Error("Individual sheet omitted a shift")
        await lea.getByText("Prends une gourde.", { exact: false }).first().waitFor()
      }
      if (report.id === "attendance") {
        const present = await output.locator(".attendance tbody tr").filter({ hasText: "présent" }).count()
        if (present !== 6) throw new Error(`Wrong pre-existing attendance marks: ${present}`)
      }
      if (report.id === "phones" && (!body.includes("+41 79 000 99 99") || !body.includes("video.documents.000@example.org"))) throw new Error("Contact override or email missing")
      const pdf = path.join(directory, `${report.id}.pdf`)
      await output.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true })
      await output.screenshot({ path: path.join(directory, `${report.id}-screen.png`), fullPage: false })
      results.push({ report: report.id, privateContacts: report.privateContacts, pdf })
      await output.close()
    }
    const evidence = { checkedAt: new Date().toISOString(), product, scope: "actual report links, live HTML and generated PDFs; PDF pagination and visual review still required", pdfVisualReview: false, activePeople: 80, individualShiftsForLea: 5, existingAttendanceMarks: 6, results }
    await writeFile(path.join(directory, "report-preflight.json"), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify(evidence, null, 2))
  } finally { await browser.close(); await db.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
