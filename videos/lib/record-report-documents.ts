// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import path from "node:path"
import { showRenderedPdfPage } from "./show-rendered-pdf-page"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>

/** Document chapters only; CSV and final printing chapters must be recorded separately. */
export async function recordReportDocuments(options: { page: Page; base: string; eventId: string; directory: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, scene, tap, settle } = options
  const open = async (label: string, suffix: string) => {
    await page.goto(`${base}/admin/events/${eventId}/print`); await settle(page)
    await page.getByRole("link", { name: new RegExp(`^${label}`) }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(650)
    const ready = page.waitForEvent("popup")
    await tap(page, page.getByRole("link", { name: new RegExp(`^${label}`) }))
    const popup = await ready
    await popup.waitForLoadState("networkidle")
    const url = new URL(popup.url())
    if (url.origin !== new URL(base).origin || !url.pathname.endsWith(`/export/${suffix}`)) throw new Error("Unexpected report destination")
    await popup.close()
    await page.goto(url.href); await settle(page)
    if (/Demande Témoin|Attente Témoin|Annulée Témoin|\/my\//.test(await page.locator("body").innerText())) throw new Error("Excluded identity in document capture")
  }
  await scene("complete", async at => {
    await at(0.12) /* mid-sentence */; await open("Export complet", "pdf")
    await at("Lisons une journée, puis retrouvons"); await page.getByText("Buvette", { exact: true }).first().scrollIntoViewIfNeeded()
    // The complete report renders first and last names in separate cells.
    await at(0.70) /* mid-sentence */; await page.getByText("Léa", { exact: true }).last().scrollIntoViewIfNeeded()
  })
  await scene("day", async at => {
    await open("Planning par jour", "sheets/day")
    // The second day is spoken around 5 s, not at the middle of the chapter.
    await at("Les postes et les créneaux"); await page.getByText(/Dimanche 11 octobre 2026/i).first().scrollIntoViewIfNeeded()
    await at("Repérons l'accueil du matin et la buvette")
    const morning = page.getByText("Accueil du matin", { exact: true }).first()
    await morning.scrollIntoViewIfNeeded(); await tap(page, morning)
  })
  await scene("role", async at => {
    await at("Si vous coordonnez un poste"); await open("Planning par poste", "sheets/role")
    await at("La buvette a sa propre"); await page.getByRole("heading", { name: "Buvette", exact: true }).scrollIntoViewIfNeeded()
    await at("Remettre cette feuille à un"); await page.getByRole("heading", { name: "Loge", exact: true }).scrollIntoViewIfNeeded()
  })
  // The narration starts with Léa's name: prepare the actual document before that cue,
  // keeping its real opening click visible in the short transition between chapters.
  await open("Planning individuel", "sheets/individual")
  const lea = page.locator("section.block").filter({ has: page.getByRole("heading", { name: "Léa Giroud", exact: true }) })
  if (await lea.locator(".card").count() !== 5) throw new Error("Incomplete individual planning")
  await lea.getByRole("heading", { name: "Léa Giroud", exact: true }).scrollIntoViewIfNeeded()
  await scene("individual", async at => {
    await at("Sa frise montre aussi les"); await showRenderedPdfPage(page, path.join(directory, "documents", "rendered", "individual", "page-04.png"), "planning de Léa, première feuille")
    await at("On retrouve ensuite le lieu"); await page.locator("img").evaluate(img => { window.scrollTo({ top: img.getBoundingClientRect().height * 0.57, behavior: "smooth" }) })
    await at("passons à la suivante pour lire le dernier poste"); await showRenderedPdfPage(page, path.join(directory, "documents", "rendered", "individual", "page-05.png"), "planning de Léa, feuille suivante")
  })
  await open("Feuille de présence", "sheets/attendance")
  await scene("attendance", async at => {
    const present = page.locator(".attendance tbody tr").filter({ hasText: "présent" })
    if (await present.count() !== 6) throw new Error("Attendance fixture differs")
    await at("En revanche, cocher une case"); await present.first().scrollIntoViewIfNeeded()
    await at(0.73) /* mid-sentence */; await page.locator(".attendance").last().scrollIntoViewIfNeeded()
  })
  await scene("contacts", async at => {
    await at("Elle permet de retrouver une"); await open("Liste avec téléphones", "sheets/phones")
    await at("Cette liste contient des coordonnées")
    const number = page.getByText("+41 79 000 99 99", { exact: true }).first()
    await number.scrollIntoViewIfNeeded(); await tap(page, number)
    // A video-only reading cue, not a new application feature or a changed document.
    await number.evaluate(el => { (el as HTMLElement).style.outline = "3px solid #2563eb"; (el as HTMLElement).style.outlineOffset = "3px" })
    if (!(await page.locator("body").innerText()).includes("video.documents.000@example.org")) throw new Error("Contact email missing")
  })
}
