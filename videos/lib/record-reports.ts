// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { recordReportDocuments } from "./record-report-documents"
import { showDownloadedCsv } from "./show-downloaded-csv"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

export async function recordReports(options: { page: Page; base: string; eventId: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, title, scene, tap, settle } = options
  const formUrl = `${base}/admin/events/${eventId}/print`
  await page.goto(`${base}/admin/events/${eventId}`); await settle(page)
  await scene("welcome", async at => {
    await page.screencast.showChapter(title, { duration: 2400 })
    await at(0.43); await tap(page, page.getByRole("link", { name: "Rapports", exact: true }))
    await page.waitForURL(formUrl); await settle(page)
  })
  await recordReportDocuments(options)
  await scene("answers", async at => {
    await page.goto(`${base}/admin/events/${eventId}/registrations`); await settle(page)
    await at(0.14)
    const ready = page.waitForEvent("download")
    await tap(page, page.getByRole("link", { name: /Exporter les présences/ }))
    const download = await ready
    const file = path.join(directory, "documents", "attendance.csv")
    await download.saveAs(file)
    await at(0.32)
    const csv = await showDownloadedCsv(page, file)
    if (csv.rows.length !== 84 || csv.people !== 80) throw new Error("Unexpected document fixture in CSV")
    await at(0.45); await page.locator(".scroll").evaluate(el => { el.scrollLeft = el.scrollWidth })
    await at(0.63)
    const person = page.getByLabel("Lecture d’une personne dans le fichier :", { exact: true })
    await tap(page, person)
    await person.selectOption("video.documents.000@example.org")
    await page.getByText("5 lignes affichées sur 84. Le fichier téléchargé reste inchangé.", { exact: true }).waitFor()
    const leaRows = page.locator("tbody tr").filter({ has: page.getByRole("cell", { name: "Léa", exact: true }) })
    if (await leaRows.count() !== 5) throw new Error("Expected five actual CSV rows for Léa")
    await leaRows.last().scrollIntoViewIfNeeded()
  })
  await scene("print", async at => {
    // These PNGs are Poppler renders of the real application-generated PDFs.
    // The heading explicitly distinguishes this read-only review from native print UI.
    const show = async (number: "04" | "05") => {
      const file = path.join(directory, "documents", "rendered", "individual", `page-${number}.png`)
      const bytes = await readFile(file)
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("Expected rendered PDF page")
      await page.setContent(`<html lang="fr"><head><meta charset="utf-8"><style>body{margin:16px;font:18px Arial;background:#eef1f5}h1{font-size:22px}img{display:block;width:740px;max-width:100%;margin:auto;background:white}</style></head><body><h1>Lecture du PDF réel — planning individuel, page ${Number(number)}</h1><p>Aperçu de contrôle, distinct de la boîte d’impression du navigateur.</p><img alt="Page du PDF généré par l’application" src="data:image/png;base64,${bytes.toString("base64")}"></body></html>`)
      await page.locator("img").evaluate(async img => { await (img as HTMLImageElement).decode() })
    }
    await at(0.10); await show("04")
    await at(0.48); await page.locator("img").evaluate(img => { window.scrollTo({ top: img.getBoundingClientRect().height / 2, behavior: "smooth" }) })
    await at(0.72); await show("05")
  })
  // setContent replaces the PDF review document and detaches the browser overlay host.
  // Navigate to a real page before opening the final chapter, so its title is visible.
  await page.goto(formUrl); await settle(page)
  await scene("result", async at => {
    await at(0.22); await page.getByRole("link", { name: /^Liste avec téléphones/ }).scrollIntoViewIfNeeded()
  })
}
