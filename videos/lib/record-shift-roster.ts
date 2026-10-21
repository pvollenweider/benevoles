// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import type { Page, Locator } from "playwright"
import type { Cue } from "./sentence-timing"
type Options = { page: Page; base: string; dir: string; scene: (id: string, action: (at: Cue) => Promise<void>) => Promise<void>; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void>; fill: (page: Page, field: Locator, value: string, pause?: number) => Promise<void> }
export async function recordShiftRoster({ page, base, dir, scene, tap, settle, fill }: Options) {
  page.setDefaultTimeout(15_000)
  const eventId = "video-shift-roster-event", roster = () => page.getByRole("region", { name: "Qui est inscrit" })
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const personal = async (key: string) => { await go(`/my/demo-roster-${key}-0001`); await roster().waitFor(); await roster().scrollIntoViewIfNeeded() }
  let aline = ""
  await scene("roster-setting", async at => {
    await go(`/admin/events/${eventId}/review`)
    await at("Sur Vérifier avant publication")
    await page.getByRole("link", { name: "Voir le réglage" }).scrollIntoViewIfNeeded()
    await at("Ouvrez Voir le réglage")
    await tap(page, page.getByRole("link", { name: "Voir le réglage" }))
    const box = page.getByRole("checkbox", { name: "Montrer aux bénévoles confirmés qui est inscrit sur chaque créneau" })
    await box.waitFor(); assert(!await box.isChecked())
    await at("Dans Réglages, cochez")
    await tap(page, box)
    await page.getByText(/Informez les bénévoles/).waitFor()
    await page.getByText(/^Modifications enregistrées à/).waitFor()
    await page.getByText(/Informez les bénévoles/).scrollIntoViewIfNeeded()
  })
  // Publish via the real UI between chapters; activation never substitutes for publication.
  await go(`/admin/events/${eventId}/review`)
  await tap(page, page.getByRole("button", { name: "Publier", exact: true }))
  await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
  await scene("roster-signup", async at => {
    await go("/fete-du-parc?org=formation-roster")
    assert.equal(await page.getByRole("region", { name: "Qui est inscrit" }).count(), 0)
    await at("Choisissez un créneau")
    await tap(page, page.getByRole("button", { name: /, Accueil[^:]* : sélectionner/ }).first())
    await tap(page, page.getByRole("button", { name: /^Continuer/ }))
    await at("Renseignez votre prénom")
    await fill(page, page.getByRole("textbox", { name: "Prénom", exact: true }), "Aline", 150)
    await fill(page, page.getByRole("textbox", { name: "Nom", exact: true }), "Martin", 150)
    await fill(page, page.getByRole("textbox", { name: "Email", exact: true }), "video.roster.aline@example.org", 150)
    await at("Acceptez la convention")
    await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
    await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association/ }))
    const consent = page.getByRole("checkbox", { name: /^J'accepte que les autres bénévoles confirmés/ })
    await at("La case de visibilité reste séparée")
    await page.getByText("Facultatif, sans effet sur ton inscription.", { exact: false }).scrollIntoViewIfNeeded(); assert(!await consent.isChecked())
    await page.screenshot({ path: `${dir}/review-consent-full-text.png` })
    await at("Cochez cette case")
    await tap(page, consent)
    await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
    await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
  })
  await scene("roster-confirm", async at => {
    await at("Ouvrez maintenant le véritable email")
    let mailId = ""
    for (let i = 0; i < 60 && !mailId; i++) {
      const response = await page.request.get('http://localhost:48026/api/v1/search?query=to%3A%22video.roster.aline%40example.org%22&limit=100')
      const data = await response.json() as { messages: { ID: string }[] }
      for (const m of data.messages) {
        const detail = await (await page.request.get(`http://localhost:48026/api/v1/message/${m.ID}`)).json() as { Text: string }
        if (detail.Text.includes("/my/")) { mailId = m.ID; break }
      }
      if (!mailId) await page.waitForTimeout(300)
    }
    assert(mailId, "Actual confirmation email missing")
    await page.goto(`http://localhost:48026/view/${mailId}`); await settle(page)
    const link = page.frameLocator("iframe").locator('a[href*="/my/"]').first(); await link.waitFor()
    const href = await link.getAttribute("href"); assert(href)
    aline = new URL(href).pathname
    await at("Suivez son lien personnel")
    // Follow the real link through the local public-host proxy.
    const popupReady = page.waitForEvent("popup")
    await tap(page, link)
    const popup = await popupReady
    await popup.waitForLoadState("domcontentloaded")
    assert.equal(new URL(popup.url()).hostname, "formation-roster.benevol.app")
    assert.equal(new URL(popup.url()).pathname, aline)
    const actual = popup.url(); await popup.close()
    await page.goto(actual); await settle(page)
    await at("Dans Qui est inscrit")
    await roster().scrollIntoViewIfNeeded()
    assert((await roster().innerText()).includes("Bruno F."))
    assert((await roster().innerText()).includes("David P."))
    assert(!(await roster().innerText()).includes("Emma"))
    await at("Cliquez sur Afficher mon nom")
    await tap(page, roster().getByRole("button", { name: "Afficher mon nom" }))
    await roster().getByRole("button", { name: "Masquer mon nom" }).waitFor()
  })
  await scene("roster-withdraw", async at => {
    await personal("bruno")
    assert((await roster().innerText()).includes("Aline M."))
    await at("Revenons sur la page d’Aline")
    await go(aline); await roster().scrollIntoViewIfNeeded()
    await at("Cliquez sur Masquer mon nom")
    await tap(page, roster().getByRole("button", { name: "Masquer mon nom" }))
    await roster().getByRole("button", { name: "Afficher mon nom" }).waitFor()
    await at("Sur la page de Bruno, Aline a disparu")
    await personal("bruno"); assert(!(await roster().innerText()).includes("Aline"))
    await at("Pourtant, sur sa propre page")
    // Retained WAV: the heuristic selects an intra-sentence pause at 12.357 s.
    // Short-window ASR identifies the next clause; its real preceding silence
    // ends at 14.314 s. Land inside that clause, after the measured onset.
    await at(14.5 / 22.001) /* mid-sentence: measured « Pourtant, sur sa propre page » */
    await go(aline); await roster().scrollIntoViewIfNeeded(); assert((await roster().innerText()).includes("David P."))
  })
  await scene("roster-existing", async at => {
    await personal("claire")
    await roster().getByRole("button", { name: "Afficher mon nom" }).waitFor()
    await at("Cliquez sur Afficher mon nom pour choisir")
    await tap(page, roster().getByRole("button", { name: "Afficher mon nom" }))
    await roster().getByRole("button", { name: "Masquer mon nom" }).waitFor()
    await at("Sur la page de Bruno, Claire apparaît")
    await personal("bruno"); assert((await roster().innerText()).includes("Claire R."))
  })
  await scene("roster-privacy", async at => {
    const text = await roster().innerText()
    assert(!/example\.org|079|Martin|Rochat|Emma/.test(text))
    await at("Ces noms ne figurent ni sur la page publique")
    await go("/fete-du-parc?org=formation-roster")
    assert.equal(await page.getByRole("region", { name: "Qui est inscrit" }).count(), 0)
    await at("Seule une personne avec une place confirmée")
    await personal("bruno")
  })
  await writeFile(`${dir}/roster-behaviour-proof.json`, JSON.stringify({ verified: new Date().toISOString(), actualEmailLink: true, pendingConfirmedFromPersonalPage: true, crossShift: true, hiddenStillSeesOthers: true, existingHiddenUntilOptIn: true, minorExcluded: true, publicHasNoRoster: true }, null, 2))
}
