// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import path from "node:path"
import { showRenderedPdfPage } from "./show-rendered-pdf-page"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

/** Keep the generated document on the recorded page; the real form still opens its popup. */
export async function recordBadges(options: { page: Page; base: string; eventId: string; title: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, title, scene, tap, settle } = options
  let fullLeaBadge: Buffer | undefined
  const formUrl = `${base}/admin/events/${eventId}/print`
  const go = async () => { await page.goto(formUrl); await settle(page) }
  const choose = async (label: string, value: string) => {
    const field = page.getByLabel(label, { exact: true })
    await tap(page, field)
    await field.selectOption(value)
    await page.waitForTimeout(650)
  }
  const open = async (expected: number) => {
    const popupReady = page.waitForEvent("popup")
    await tap(page, page.getByRole("button", { name: /^Ouvrir les badges/ }))
    const popup = await popupReady
    await popup.waitForLoadState("networkidle")
    const url = popup.url()
    if (new URL(url).origin !== new URL(base).origin) throw new Error("Non-local badge document")
    await popup.close()
    await page.goto(url)
    await settle(page)
    if (await page.locator(".badge").count() !== expected) throw new Error("Badge capture differs from fixture")
  }
  await go()
  await scene("welcome", async at => {
    await page.screencast.showChapter(title, { duration: 2400 })
    await at(0.30); await page.getByRole("button", { name: /^Ouvrir les badges/ }).scrollIntoViewIfNeeded()
  })
  await scene("all", async at => {
    await at(0.12); await open(80)
    await at(0.35); await page.locator(".badge").filter({ hasText: "Léa" }).scrollIntoViewIfNeeded()
    fullLeaBadge = await page.locator(".badge").filter({ hasText: "Léa" }).screenshot()
    await at(0.60); await page.locator(".sheet").nth(1).scrollIntoViewIfNeeded()
  })
  await scene("role", async at => {
    await go(); await at(0.15); await choose("Poste", "Buvette")
    await at(0.26); await open(28)
    await at(0.35); await page.locator(".badge").filter({ hasText: "Léa" }).scrollIntoViewIfNeeded()
    const filtered = await page.locator(".badge").filter({ hasText: "Léa" }).screenshot()
    if (!fullLeaBadge) throw new Error("Actual full badge screenshot missing")
    await at(0.42)
    // Both unmodified images come from the actual generated documents in this take.
    // This explicitly labelled read-only comparison is not an application screen.
    const comparison = `<html lang="fr"><head><meta charset="utf-8"><style>body{margin:30px;background:#eef1f5;font:20px Arial}h1{font-size:26px}main{display:flex;gap:30px}figure{margin:0;background:white;padding:20px}figcaption{margin-bottom:15px}img{width:480px;max-width:100%}</style></head><body><h1>Comparer deux badges réellement générés</h1><p>Vue de lecture de la démonstration, distincte de l'application. Images inchangées.</p><main><figure><figcaption>Léa — tous les postes</figcaption><img alt="Badge complet de Léa" src="data:image/png;base64,${fullLeaBadge.toString("base64")}"></figure><figure><figcaption>Léa — filtre Buvette</figcaption><img alt="Badge de Léa filtré pour Buvette" src="data:image/png;base64,${filtered.toString("base64")}"></figure></main></body></html>`
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(comparison)}`)
    await page.locator("img").evaluateAll(async images => { await Promise.all(images.map(img => (img as HTMLImageElement).decode())) })
  })
  await scene("individual", async at => {
    await go(); await at(0.12); await choose("Bénévole (réimpression)", "video-document-person-1")
    await at(0.32); await choose("Bénévole (réimpression)", "video-document-person-2")
    await at(0.68); await open(1)
    await page.locator(".badge").filter({ hasText: "Camille" }).waitFor()
  })
  await scene("empty", async at => {
    await go(); await choose("Poste", "Loge"); await at(0.18)
    await choose("Bénévole (réimpression)", "video-document-person-1")
    await at(0.23); await open(0)
    await page.getByText(/Tous les postes/).first().waitFor()
    await at(0.48); await go(); await choose("Bénévole (réimpression)", "video-document-person-1"); await open(1)
  })
  await scene("colors", async at => {
    for (const [fraction, color] of [[0.08, "role"], [0.36, "event"], [0.66, "none"]] as const) {
      await at(fraction); await go(); await choose("Couleur du bandeau", color); await open(80)
    }
  })
  await scene("fields", async at => {
    await go(); await choose("Bénévole (réimpression)", "video-document-person-0")
    await at(0.10); await tap(page, page.getByRole("checkbox", { name: "Nom de famille", exact: true }))
    await at(0.18); await tap(page, page.getByRole("checkbox", { name: "Créneaux", exact: true })); await open(1)
    if (await page.locator(".last, .shifts").count()) throw new Error("Unchecked fields still printed")
    await at(0.37); await go(); await choose("Bénévole (réimpression)", "video-document-person-0"); await open(1)
    await page.getByText(/\+ 1 autre/).waitFor()
  })
  await scene("print", async at => {
    await go(); await at(0.12); await open(80)
    await at(0.18); await page.locator(".sheet").last().scrollIntoViewIfNeeded()
    await at(0.29); await page.locator(".sheet").first().scrollIntoViewIfNeeded()
    await at(0.65); await showRenderedPdfPage(page, path.resolve("videos/output/volunteer-badges/documents/rendered/all/page-1.png"), "Badges — page 1 sur 8")
    await at(0.82); await showRenderedPdfPage(page, path.resolve("videos/output/volunteer-badges/documents/rendered/all/page-8.png"), "Badges — page 8 sur 8")
  })
  // Return to the real application before the next title, renewing its overlay host.
  await go()
  await choose("Bénévole (réimpression)", "video-document-person-0"); await open(1)
  await scene("result", async () => { await page.locator(".badge").filter({ hasText: "Léa" }).waitFor() })
}
