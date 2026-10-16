// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import path from "node:path"
import { showRenderedPdfPage } from "./show-rendered-pdf-page"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>

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
    await at("Depuis Documents, ouvrons les options"); await page.getByRole("button", { name: /^Ouvrir les badges/ }).scrollIntoViewIfNeeded()
  })
  await scene("all", async at => {
    await at("La série comporte un badge"); await open(80)
    await at("Léa est sur plusieurs horaires"); await page.locator(".badge").filter({ hasText: "Léa" }).scrollIntoViewIfNeeded()
    fullLeaBadge = await page.locator(".badge").filter({ hasText: "Léa" }).screenshot()
    await at("Le format prévoit dix badges"); await page.locator(".sheet").nth(1).scrollIntoViewIfNeeded()
  })
  await scene("role", async at => {
    await go(); await at("Pour préparer seulement la buvette"); await choose("Poste", "Buvette")
    await at(0.26) /* mid-sentence */; await open(28)
    await at("Comparons le badge de Léa"); await page.locator(".badge").filter({ hasText: "Léa" }).scrollIntoViewIfNeeded()
    const filtered = await page.locator(".badge").filter({ hasText: "Léa" }).screenshot()
    if (!fullLeaBadge) throw new Error("Actual full badge screenshot missing")
    await at("ses autres postes ne figurent")
    // Both unmodified images come from the actual generated documents in this take.
    // This explicitly labelled read-only comparison is not an application screen.
    const comparison = `<html lang="fr"><head><meta charset="utf-8"><style>body{margin:30px;background:#eef1f5;font:20px Arial}h1{font-size:26px}main{display:flex;gap:30px}figure{margin:0;background:white;padding:20px}figcaption{margin-bottom:15px}img{width:480px;max-width:100%}</style></head><body><h1>Comparer deux badges réellement générés</h1><p>Vue de lecture de la démonstration, distincte de l'application. Images inchangées.</p><main><figure><figcaption>Léa — tous les postes</figcaption><img alt="Badge complet de Léa" src="data:image/png;base64,${fullLeaBadge.toString("base64")}"></figure><figure><figcaption>Léa — filtre Buvette</figcaption><img alt="Badge de Léa filtré pour Buvette" src="data:image/png;base64,${filtered.toString("base64")}"></figure></main></body></html>`
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(comparison)}`)
    await page.locator("img").evaluateAll(async images => { await Promise.all(images.map(img => (img as HTMLImageElement).decode())) })
  })
  await scene("individual", async at => {
    await go(); await choose("Poste", "Buvette"); await at("Nous avons deux Camille Berger"); await choose("Bénévole (réimpression)", "video-document-person-1")
    await at("Elle n'est pas imprimée sur"); await choose("Bénévole (réimpression)", "video-document-person-2")
    await at("Sélectionnons la bonne Camille, puis"); await choose("Bénévole (réimpression)", "video-document-person-1"); await open(1)
    await page.locator(".badge").filter({ hasText: "Camille" }).waitFor()
  })
  await scene("empty", async at => {
    await go(); await choose("Poste", "Loge"); await at("Voici le vrai message de")
    await choose("Bénévole (réimpression)", "video-document-person-1")
    await at("Voici le vrai message de"); await open(0)
    await page.getByText(/Tous les postes/).first().waitFor()
    await at("Revenons aux filtres et choisissons"); await go(); await choose("Poste", ""); await choose("Bénévole (réimpression)", "video-document-person-1"); await open(1)
  })
  await scene("colors", async at => {
    for (const [fraction, color] of [[0.08, "role"], [0.36, "event"], [0.66, "none"]] as const) {
      await at(fraction); await go(); await choose("Couleur du bandeau", color); await open(80)
    }
  })
  await scene("fields", async at => {
    await go(); await choose("Bénévole (réimpression)", "video-document-person-0")
    await at("Décochons les deux cases, générons"); await tap(page, page.getByRole("checkbox", { name: "Nom de famille", exact: true }))
    await at("Décochons les deux cases, générons"); await tap(page, page.getByRole("checkbox", { name: "Créneaux", exact: true })); await open(1)
    if (await page.locator(".last, .shifts").count()) throw new Error("Unchecked fields still printed")
    await at("Léa a cinq créneaux "); await go(); await choose("Bénévole (réimpression)", "video-document-person-0"); await open(1)
    await page.getByText(/\+ 1 autre/).waitFor()
  })
  await scene("print", async at => {
    await go(); await at("Voici le document imprimable "); await open(80)
    await at("Vérifions aussi Jean-Baptiste et Marie-Charlotte"); await page.locator(".badge").filter({ hasText: "Marie-Charlotte" }).scrollIntoViewIfNeeded()
    await at("La boîte d'impression du navigateur n'est pas filmée ici"); await page.locator(".sheet").first().scrollIntoViewIfNeeded()
    await at("Regardons le vrai PDF obtenu"); await showRenderedPdfPage(page, path.resolve("videos/output/volunteer-badges/documents/rendered/all/page-1.png"), "Badges — page 1 sur 8")
    await at("Cet aperçu sert à contrôler"); await showRenderedPdfPage(page, path.resolve("videos/output/volunteer-badges/documents/rendered/all/page-8.png"), "Badges — page 8 sur 8")
  })
  // Return to the real application before the next title, renewing its overlay host.
  await go()
  await choose("Bénévole (réimpression)", "video-document-person-0"); await open(1)
  await scene("result", async () => { await page.locator(".badge").filter({ hasText: "Léa" }).waitFor() })
}
