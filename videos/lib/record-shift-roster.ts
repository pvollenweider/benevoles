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
  const toggle = () => page.getByRole("button", { name: "Voir qui est inscrit", exact: true })
  const box = () => page.getByRole("checkbox", { name: "Permettre aux bénévoles confirmés et aux membres invités de voir qui est inscrit", exact: true })
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const personal = async (key: string) => { await go(`/my/demo-roster-${key}-0001`); await roster().waitFor(); await roster().scrollIntoViewIfNeeded() }
  const invitation = async () => { await go("/fete-du-parc?org=formation-roster&token=demo-roster-invite-gina-0001"); await toggle().waitFor(); assert.equal(await toggle().getAttribute("aria-pressed"), "false") }
  const list = async () => { await tap(page, page.getByRole("button", { name: "Liste", exact: true })); await settle(page) }
  const names = () => page.locator("main").innerText()
  let aline = ""
  await scene("roster-setting", async at => {
    await go("/admin/settings/admins")
    const defaultBox = page.getByRole("checkbox", { name: /^Par défaut, permettre aux bénévoles confirmés/ })
    await defaultBox.scrollIntoViewIfNeeded(); assert(await defaultBox.isChecked())
    await at("Ouvrons un nouvel événement")
    await go("/admin/events/new"); await box().scrollIntoViewIfNeeded(); assert(await box().isChecked())
    await at("Vous pouvez la décocher pour cet événement")
    await tap(page, box()); assert(!await box().isChecked()); await tap(page, box())
    await at("Le rappel demande d’informer les bénévoles")
    await page.getByText(/Informez les bénévoles/).scrollIntoViewIfNeeded()
  })
  await scene("roster-publication", async at => {
    await go(`/admin/events/${eventId}/edit`); await box().scrollIntoViewIfNeeded(); assert(await box().isChecked())
    await at("Vous pouvez la désactiver puis la réactiver")
    await tap(page, box()); await page.getByText(/^Modifications enregistrées à/).waitFor()
    await tap(page, box()); await page.getByText(/Informez les bénévoles/).waitFor(); await page.waitForTimeout(1500)
    await at("Sur Vérifier avant publication")
    await go(`/admin/events/${eventId}/review`)
    await page.getByRole("link", { name: "Modifier le réglage « Qui est inscrit »" }).scrollIntoViewIfNeeded()
    await at("Publions l’événement")
    await tap(page, page.getByRole("button", { name: "Publier", exact: true }))
    await page.getByText("L'événement est publié : les bénévoles peuvent s'inscrire.").waitFor()
  })
  await scene("roster-signup", async at => {
    await go("/fete-du-parc?org=formation-roster")
    assert.equal(await page.getByRole("region", { name: "Qui est inscrit" }).count(), 0)
    await at("Choisissez un créneau")
    await tap(page, page.getByRole("button", { name: /, Accueil[^:]* : sélectionner/ }).first())
    await tap(page, page.getByRole("button", { name: /^Continuer/ }))
    await at("Renseignez votre prénom")
    await fill(page, page.getByRole("textbox", { name: "Prénom", exact: true }), "Aline", 35)
    await fill(page, page.getByRole("textbox", { name: "Nom", exact: true }), "Martin", 35)
    await fill(page, page.getByRole("textbox", { name: "Email", exact: true }), "video.roster.aline@example.org", 35)
    await at("Acceptez la convention")
    await tap(page, page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox"))
    await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association/ }))
    const consent = page.getByRole("checkbox", { name: /^J'accepte que les bénévoles confirmés et les membres invités/ })
    await at("La case de visibilité est facultative")
    await page.getByText("Facultatif, sans effet sur ton inscription.", { exact: false }).scrollIntoViewIfNeeded(); assert(!await consent.isChecked())
    await page.screenshot({ path: `${dir}/review-consent-full-text.png` })
    await at("Cochez cette case")
    await tap(page, consent)
    await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
    await page.getByRole("heading", { name: /inscription confirmée/i }).waitFor()
  })
  await scene("roster-confirm", async at => {
    await at("Ouvrez le véritable email de confirmation")
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
    await at("La carte Qui est inscrit montre uniquement")
    await roster().scrollIntoViewIfNeeded()
    assert.equal(await roster().getByRole("heading", { level: 3 }).count(), 1)
    assert(/David\s+P/.test(await roster().innerText()))
    await at("Cliquez sur Afficher mon nom")
    await tap(page, roster().getByRole("button", { name: "Afficher mon nom", exact: true }))
    await roster().getByRole("button", { name: "Masquer mon nom" }).waitFor()
    await at("Pour consulter les autres créneaux")
    await tap(page, roster().getByRole("link", { name: "Voir qui est inscrit sur les autres créneaux" }))
    await toggle().waitFor(); assert.equal(await toggle().getAttribute("aria-pressed"), "true")
  })
  await scene("roster-event", async at => {
    await toggle().scrollIntoViewIfNeeded()
    await at("Passons en Liste")
    await list(); assert((await names()).includes("Avec toi")); assert((await names()).includes("Sur ce créneau"))
    await at("Passons en Frise")
    await tap(page, page.getByRole("button", { name: "Frise", exact: true }))
    await at("Survolez un créneau")
    const bar = page.getByRole("button", { name: /, Buvette[^:]* : sélectionner/ }).first()
    await bar.hover(); await page.getByText(/Buvette · (12h|12:00)/, { exact: false }).waitFor()
    assert((await names()).includes("Bruno"))
  })
  await scene("roster-invite", async at => {
    await invitation()
    await at("Activez Voir qui est inscrit")
    await tap(page, toggle())
    await at("En Liste, Aline apparaît")
    await list(); assert((await names()).includes("Aline")); await page.screenshot({ path: `${dir}/review-invitation-list.png` }); assert(!/Bruno\s+F/.test(await names())); assert((await names()).includes("autres bénévoles"))
  })
  await scene("roster-existing", async at => {
    await personal("bruno")
    const widen = roster().getByRole("button", { name: "Montrer aussi mon nom aux membres invités" })
    await widen.waitFor()
    await at("Cliquez sur ce bouton pour élargir cet accord")
    await tap(page, widen); await widen.waitFor({ state: "detached" })
    await at("Sur le lien d’invitation, Bruno devient visible")
    await invitation(); await tap(page, toggle()); await list(); assert((await names()).includes("Bruno"))
  })
  await scene("roster-withdraw", async at => {
    await go(aline); await roster().scrollIntoViewIfNeeded()
    await at("Cliquez sur Masquer mon nom")
    await tap(page, roster().getByRole("button", { name: "Masquer mon nom" })); await roster().getByRole("button", { name: "Afficher mon nom", exact: true }).waitFor()
    await at("Sur la page ouverte par l’invitation")
    await invitation(); await tap(page, toggle()); await list(); assert(!/Aline\s+M/.test(await names())); assert(!(await names()).includes("Emma"))
    await at("Pour terminer, voici la même page sans identification")
    await page.context().clearCookies()
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await go("/fete-du-parc?org=formation-roster")
    assert.equal(await toggle().count(), 0); assert(!/David P\.|Bruno F\.|Aline M\./.test(await names()))
  })
  await writeFile(`${dir}/roster-behaviour-proof.json`, JSON.stringify({ verified: new Date().toISOString(), orgDefault: true, newEventDefault: true, eventToggle: true, actualEmailLink: true, personalOwnOnly: true, listAndFrise: true, invitedBeforeSignup: true, v1WidenExplicit: true, hideRemovedForOthers: true, anonymousNoSwitch: true, minorExcluded: true }, null, 2))
}
