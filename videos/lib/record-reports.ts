// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { verifyProductBuild } from "./product-build"
import { parse } from "csv-parse/sync"
import { recordReportDocuments } from "./record-report-documents"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

export async function recordReports(options: { page: Page; base: string; eventId: string; directory: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, title, scene, tap, settle } = options
  const product = await verifyProductBuild(base)
  const documents = JSON.parse(await readFile(path.join(directory, "documents", "report-preflight.json"), "utf8"))
  if (documents.product?.commit !== product.commit || documents.product?.buildId !== product.buildId) throw new Error("Regenerate report documents on the capture build before filming")
  const formUrl = `${base}/admin/events/${eventId}/print`
  await page.goto(`${base}/admin/events/${eventId}`); await settle(page)
  await scene("welcome", async at => {
    await page.screencast.showChapter(title, { duration: 2400 })
    await at(0.23); await tap(page, page.getByRole("link", { name: "Rapports", exact: true }))
    await page.waitForURL(formUrl); await settle(page)
    const headings = await page.getByRole("heading").allTextContents()
    const expected = ["À afficher ou à remettre aux bénévoles", "Pour les organisateurs seulement", "Badges", "Résumé de l'événement", "Archive"]
    let previous = -1
    for (const text of expected) {
      const position = headings.findIndex(heading => heading.includes(text))
      if (position <= previous) throw new Error(`Current main report order missing: ${text}`)
      previous = position
    }
    await page.getByRole("link", { name: /^Synthèse des réponses/ }).waitFor()
    await at(0.56); await page.getByRole("heading", { name: "Badges", exact: true }).scrollIntoViewIfNeeded()
    await at(0.76); await page.getByRole("heading", { name: "Archive", exact: true }).scrollIntoViewIfNeeded()
  })
  await recordReportDocuments(options)
  await scene("answers", async at => {
    await page.goto(`${base}/admin/events/${eventId}/questions`); await settle(page)
    await page.getByRole("heading", { name: "Synthèse des réponses", exact: true }).scrollIntoViewIfNeeded()
    await page.getByText(/Chaque bénévole compte une fois/).waitFor()
    await at(0.35)
    const ready = page.waitForEvent("download")
    await tap(page, page.getByRole("link", { name: /^Télécharger la synthèse/ }))
    const download = await ready
    const file = path.join(directory, "documents", "answers-summary.csv")
    await download.saveAs(file)
    const csv = await readFile(file, "utf8")
    if (!csv.includes("Taille") || csv.includes("video.documents.000@example.org")) throw new Error("Unexpected summary CSV or private coordinates included")
    const rows = parse(csv, { bom: true, delimiter: ";", columns: true }) as Record<string, string>[]
    const questionLabels = [...new Set(rows.map(row => row.Question))]
    if (questionLabels.length !== 2 || questionLabels.some(label => rows.filter(row => row.Question === label).reduce((sum, row) => sum + Number(row["Confirmés"]), 0) !== 80)) throw new Error("Summary must count 80 people, not 84 registrations, for each question")
    await at(0.60)
    const popupReady = page.waitForEvent("popup")
    await tap(page, page.getByRole("link", { name: /^Imprimer la synthèse/ }))
    const popup = await popupReady
    await popup.waitForLoadState("networkidle")
    const url = new URL(popup.url())
    if (url.origin !== new URL(base).origin || !url.pathname.endsWith("/export/sheets/answers")) throw new Error("Unexpected answer summary destination")
    await popup.close()
    await page.goto(url.href); await settle(page)
    await page.getByText(/Taille/).first().waitFor()
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
