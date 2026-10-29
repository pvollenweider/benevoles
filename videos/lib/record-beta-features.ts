// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Captures of the beta videos (#1168, #1147, #1169, #1174): BETA_ACCESS, SECTORS, SHIFT_SWAPS and
 * the sector part of SECTOR_LEADERS, on the dedicated organisation of scripts/seed-video-beta.ts
 * (scenarios beta-access, sectors, shift-swaps, sector-leaders). Every action goes through the
 * real screens; sessions switch by their real cookies, prepared before the screencast starts, so
 * no login form is filmed. Volunteers use their personal links (`/my/<token>`), as in their emails.
 * Every take needs its own fresh seed: the takes change the fixture (sectors, swaps, leaders).
 */
import assert from "node:assert/strict"
import type { Cookie, Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Type = (page: Page, field: Locator, value: string) => Promise<void>
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; typeNaturally: Type }

/** Fixed ids and tokens of scripts/seed-video-beta.ts (kept here: the recorder never imports a seed). */
const EVENT_ID = "video-beta-event"
const OWNER_EMAIL = "video.beta.owner@example.org"
const OPERATOR_EMAIL = "video.beta.operator@example.org"
const ORG_NAME = "Association du Festival de Montvert"
const token = (scenario: string, key: string) => `demo-beta-${scenario}-${key}-0001`
const MAILPIT = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"

/** A real session of `email`, opened in a separate context before the screencast. */
export async function betaSessionCookies(page: Page, base: string, email: string): Promise<Cookie[]> {
  const other = await page.context().browser()!.newContext({ locale: "fr-CH", timezoneId: "Europe/Zurich" })
  try {
    const login = await other.newPage()
    await login.goto(`${base}/admin/login`)
    await login.getByLabel(/^Email(?:\s|$)/).fill(email)
    await login.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await login.getByRole("button", { name: "Se connecter", exact: true }).click()
    await login.waitForURL(url => !url.pathname.startsWith("/admin/login"))
    return await other.cookies()
  } finally { await other.close() }
}

export const BETA_OWNER_EMAIL = OWNER_EMAIL
export const BETA_OPERATOR_EMAIL = OPERATOR_EMAIL

async function switchSession(page: Page, cookies: Cookie[]) {
  await page.context().clearCookies()
  await page.context().addCookies(cookies)
}

/** Pages that poll (Jour J) or keep requests open (personal page): DOM, fonts, then a visible landmark. */
async function settleDom(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

/** The newest message of the take to `to` whose subject matches, from the real local mailbox. */
async function waitForMail(page: Page, to: string, subject: RegExp): Promise<{ ID: string; Subject: string }> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await page.request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${to}`, limit: 50 } })
    if (response.ok()) {
      const result = await response.json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] }
      const found = result.messages.find(m => subject.test(m.Subject) && m.To.some(t => t.Address === to))
      if (found) return found
    }
    await page.waitForTimeout(250)
  }
  throw new Error(`No email « ${subject.source} » to ${to}`)
}

/** Opens a message through Mailpit's search for its recipient: the side list shows that person's messages only. */
async function openMail(page: Page, tap: Tap, to: string, id: string) {
  await page.goto(`${MAILPIT}/search?q=${encodeURIComponent(`to:${to}`)}`); await settleDom(page)
  await tap(page, page.locator(`a[href="/view/${id}"]`).first())
  await page.frameLocator("iframe").locator("body").waitFor()
}

// ── BETA_ACCESS ─────────────────────────────────────────────────────────────────────────────

export async function recordBetaAccess(options: Options & { operator: Cookie[]; owner: Cookie[] }) {
  const { page, base, title, scene, tap, settle, operator, owner } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const capability = (label: string) => page.getByRole("checkbox", { name: label, exact: true })
  await switchSession(page, operator)
  await go("/super-admin/organizations")
  await scene("beta-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Trois accords avant d'utiliser une fonction avancée", duration: 2_400 })
  })
  await scene("beta-operator", async at => {
    await at("ouvrons Fonctions bêta depuis le menu Super Admin")
    await tap(page, page.getByRole("button", { name: /^Super Admin/ }).filter({ visible: true }).first())
    await tap(page, page.getByRole("menuitem", { name: "Fonctions bêta", exact: true }))
    await page.getByRole("heading", { level: 1, name: "Fonctions bêta", exact: true }).waitFor()
    assert(!(await capability("Secteurs").isChecked()) && !(await capability("Échanges de créneaux").isChecked()), "Beta access fixture already used: run the beta-access seed")
    await at("Cochons Secteurs, puis Échanges de créneaux")
    await tap(page, capability("Secteurs"))
    await tap(page, capability("Échanges de créneaux"))
    await tap(page, page.getByRole("region", { name: "Fonctions ouvertes à l'essai" }).getByRole("button", { name: "Enregistrer", exact: true }))
    await page.getByText("Fonctions ouvertes enregistrées.", { exact: true }).waitFor()
    await at("Pour l'instant, aucune organisation n'y participe")
    const participants = page.getByRole("region", { name: "Organisations participantes" })
    await participants.scrollIntoViewIfNeeded()
    await participants.getByText("Aucune organisation ne participe à la bêta.", { exact: true }).waitFor()
  })
  await switchSession(page, owner)
  await go("/admin/events")
  await scene("beta-owner", async at => {
    await at("Dans Paramètres, une nouvelle carte Fonctions bêta est apparue")
    await go("/admin/settings/admins")
    const card = page.getByRole("region", { name: "Fonctions bêta", exact: true })
    await card.scrollIntoViewIfNeeded()
    await card.getByText("Votre organisation ne participe pas à la bêta.", { exact: true }).waitFor()
    await at("Elle liste ce que la bêta permet d'essayer")
    await card.getByText("Secteurs", { exact: true }).waitFor()
    await card.getByText("Échanges de créneaux", { exact: true }).waitFor()
    await at("Activons l'interrupteur")
    const toggle = card.getByRole("switch", { name: "Essayer les fonctions avancées en bêta", exact: true })
    assert.equal(await toggle.getAttribute("aria-checked"), "false")
    await tap(page, toggle)
    await card.getByText(/^Votre organisation participe à la bêta depuis le .+ \(activée par Élodie Nováková\)\.$/).waitFor()
    assert.equal(await toggle.getAttribute("aria-checked"), "true")
  })
  await scene("beta-event", async at => {
    await at("Ouvrons les informations du Festival de Montvert")
    await go(`/admin/events/${EVENT_ID}/edit`)
    const swaps = page.locator('[data-event-swaps="1"]')
    const sectors = page.locator('[data-event-sectors="1"]')
    await at("Deux cartes proposent maintenant leur option")
    await swaps.scrollIntoViewIfNeeded()
    assert.equal(await swaps.getByRole("switch", { name: "Autoriser les demandes d'échange de créneaux", exact: true }).getAttribute("aria-checked"), "false")
    await at("Échanges de créneaux et Secteurs")
    await sectors.scrollIntoViewIfNeeded()
    assert.equal(await sectors.getByRole("switch", { name: "Organiser les postes par secteurs", exact: true }).getAttribute("aria-checked"), "false")
  })
  await switchSession(page, operator)
  await scene("beta-close", async at => {
    await at("Revenons chez l'opérateur")
    await go("/super-admin/beta")
    const participants = page.getByRole("region", { name: "Organisations participantes" })
    await participants.scrollIntoViewIfNeeded()
    await participants.getByText(new RegExp(`^${ORG_NAME} \\(formation-beta\\), depuis le `)).waitFor()
    await at("Si l'opérateur ferme une fonction")
    await page.getByText(/^Une fonction ouverte peut être adoptée/).scrollIntoViewIfNeeded()
  })
}

// ── SECTORS ─────────────────────────────────────────────────────────────────────────────────

export async function recordSectors(options: Options) {
  const { page, base, title, scene, tap, settle, typeNaturally } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const event = `/admin/events/${EVENT_ID}`
  const panel = () => page.locator('[data-sectors-section="1"]')
  const sectorFilter = () => page.getByLabel("Secteur", { exact: true })
  let parkingId = ""
  const chooseParking = async () => {
    const select = sectorFilter()
    await select.scrollIntoViewIfNeeded()
    await tap(page, select)
    await select.selectOption({ label: "Parking" })
    await page.waitForURL(url => url.searchParams.get("secteur") === parkingId)
    await settleDom(page)
  }
  await go(`${event}/edit`)
  const card = page.locator('[data-event-sectors="1"]')
  assert.equal(await card.getByRole("switch", { name: "Organiser les postes par secteurs", exact: true }).getAttribute("aria-checked"), "false", "Sectors fixture already used: run the sectors seed")
  await scene("sectors-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Regrouper les postes sans rien changer pour les bénévoles", duration: 2_400 })
  })
  await scene("sectors-enable", async at => {
    await at("la carte Secteurs propose l'interrupteur")
    await card.scrollIntoViewIfNeeded()
    await at("Activons-le")
    await tap(page, card.getByRole("switch", { name: "Organiser les postes par secteurs", exact: true }))
    await card.getByText(/^Secteurs activés/).waitFor()
    await at("Suivons le lien Organiser les secteurs dans Créneaux")
    await tap(page, card.getByRole("link", { name: "Organiser les secteurs dans Créneaux", exact: true }))
    await page.waitForURL(url => url.pathname.endsWith("/shifts")); await settle(page)
  })
  await scene("sectors-create", async at => {
    await at("Ouvrons Gérer les postes")
    await tap(page, page.getByRole("button", { name: "Gérer les postes", exact: true }))
    await panel().getByRole("heading", { name: /^Secteurs/ }).waitFor()
    await at("Tapons Parking dans Nouveau secteur")
    await typeNaturally(page, page.getByLabel("Nouveau secteur", { exact: true }), "Parking")
    await tap(page, page.getByRole("button", { name: "Ajouter le secteur", exact: true }))
    await panel().getByRole("heading", { level: 4, name: "Parking", exact: true }).waitFor()
    await at("Ajoutons de même Backline")
    await typeNaturally(page, page.getByLabel("Nouveau secteur", { exact: true }), "Backline")
    await tap(page, page.getByRole("button", { name: "Ajouter le secteur", exact: true }))
    await panel().getByRole("heading", { level: 4, name: "Backline", exact: true }).waitFor()
    await at("Le bouton et le panneau s'appellent désormais")
    await page.getByRole("button", { name: "Gérer les secteurs et postes", exact: true }).scrollIntoViewIfNeeded()
  })
  await scene("sectors-poste", async at => {
    await at("Sous Backline, le bouton")
    await tap(page, page.getByRole("button", { name: "Ajouter un poste dans « Backline »", exact: true }))
    const editor = page.getByRole("group", { name: "Nouveau poste : premier créneau", exact: true })
    await editor.waitFor()
    await at("Tapons le nom du nouveau poste")
    await typeNaturally(page, editor.getByLabel(/^Poste/), "Backline Scène du Lac")
    await at("puis son premier créneau")
    const date = editor.getByLabel(/^Date/)
    await tap(page, date); await date.selectOption({ index: 1 })
    await typeNaturally(page, editor.getByLabel(/^Début/), "14:00")
    await typeNaturally(page, editor.getByLabel(/^Fin/), "18:00")
    const places = editor.getByLabel(/^Places/)
    await places.fill(""); await typeNaturally(page, places, "4")
    await at("Le poste est créé avec ce créneau")
    await tap(page, editor.getByRole("button", { name: "Ajouter", exact: true }))
    await editor.waitFor({ state: "hidden" })
    await panel().getByText("Backline Scène du Lac", { exact: true }).first().scrollIntoViewIfNeeded()
  })
  const move = async (poste: string) => {
    await tap(page, page.getByRole("button", { name: `Déplacer le poste « ${poste} »`, exact: true }))
    const select = page.getByLabel(`Déplacer le poste « ${poste} » vers`, { exact: true })
    await tap(page, select); await select.selectOption({ label: "Parking" })
    await tap(page, page.locator("form").filter({ has: select }).getByRole("button", { name: "Déplacer", exact: true }))
    await select.waitFor({ state: "hidden" })
  }
  await scene("sectors-move", async at => {
    await at("Les postes qui existaient avant le premier secteur")
    await panel().getByRole("heading", { level: 4, name: "Autres postes", exact: true }).scrollIntoViewIfNeeded()
    await at("Pour Parking Nord, choisissons Parking")
    await move("Parking Nord")
    await at("Faisons de même pour Parking Mairie")
    await move("Parking Mairie")
    await at("Le bar de la Grande Scène")
    await panel().getByRole("heading", { level: 4, name: "Autres postes", exact: true }).scrollIntoViewIfNeeded()
  })
  await scene("sectors-timeline", async at => {
    await at("Revenons à la frise")
    await go(`${event}/shifts`)
    const parking = page.locator("[data-sector-toggle]").filter({ hasText: "Parking" }).first()
    await parking.scrollIntoViewIfNeeded()
    await at("Un clic sur cette ligne replie ses postes")
    await tap(page, parking)
    assert.equal(await parking.getAttribute("aria-expanded"), "false")
    await page.waitForTimeout(900)
    await tap(page, parking)
    await at("Les postes sans secteur sont regroupés à la fin")
    await page.locator("[data-sector-toggle]").filter({ hasText: "Autres postes" }).first().scrollIntoViewIfNeeded()
  })
  await scene("sectors-pdf", async at => {
    await at("Dans Documents, ouvrons l'export complet")
    await go(`${event}/print`)
    const link = page.getByRole("link", { name: /^Export complet/ })
    await link.scrollIntoViewIfNeeded()
    const popupReady = page.waitForEvent("popup")
    await tap(page, link)
    const popup = await popupReady
    await popup.waitForLoadState("domcontentloaded")
    const url = new URL(popup.url())
    await popup.close()
    assert(url.origin === new URL(base).origin && url.pathname.endsWith("/export/pdf"), "Unexpected export destination")
    await page.goto(url.href); await settleDom(page)
    await at("La frise de chaque jour et le récapitulatif par poste")
    await page.locator("tr.sector-row").filter({ hasText: "Parking" }).first().scrollIntoViewIfNeeded()
    await at(0.82) /* mid-sentence: « puis Autres postes » */
    await page.locator("tr.sector-row").filter({ hasText: "Autres postes" }).first().scrollIntoViewIfNeeded()
  })
  await go(`${event}/registrations`)
  // The sector's id, for the filtered pages: the value of the page's own « Secteur » option.
  parkingId = await sectorFilter().locator("option", { hasText: /^Parking$/ }).getAttribute("value") ?? ""
  assert(parkingId, "Parking sector id not found")
  await scene("sectors-filter", async at => {
    await at("Dans Inscriptions, choisissons Parking")
    await chooseParking()
    await at("La liste, les compteurs et l'export des présences")
    await page.getByRole("link", { name: /^Exporter les présences/ }).first().scrollIntoViewIfNeeded()
    await at("En la rouvrant, ou en la transmettant")
    await page.goto(page.url()); await settleDom(page)
    assert.equal(await sectorFilter().inputValue(), parkingId)
  })
  await scene("sectors-pages", async at => {
    await at("Le même champ existe dans Où manque-t-il du monde")
    await go(`${event}/staffing`)
    await chooseParking()
    await at(0.2) /* mid-sentence: « dans Jour J » */
    await page.goto(`${base}${event}/day-of`); await settleDom(page)
    await chooseParking()
    await at(0.32) /* mid-sentence: « et dans Documents » */
    await go(`${event}/print`)
    await chooseParking()
    await at("Il ne propose que les secteurs actifs")
    await page.getByText(/^Le secteur choisi s'applique aussi aux documents/).scrollIntoViewIfNeeded()
  })
  await scene("sectors-message", async at => {
    await at("Revenons aux inscriptions du secteur Parking")
    await go(`${event}/registrations?secteur=${encodeURIComponent(parkingId)}`)
    await at("Le bouton Écrire au secteur Parking")
    await tap(page, page.getByRole("link", { name: "Écrire au secteur Parking", exact: true }))
    await page.waitForURL(url => url.pathname.endsWith("/message")); await settle(page)
    assert(await page.getByRole("radio", { name: "Les bénévoles d'un secteur", exact: true }).isChecked())
    await at("Le compteur indique combien de personnes")
    const count = page.getByText(/^\d+ personnes? recevr(?:a|ont) ce message\.$/)
    await count.waitFor()
    assert.equal(await count.innerText(), "5 personnes recevront ce message.")
    await count.scrollIntoViewIfNeeded()
  })
  await scene("sectors-result", async at => {
    await at("Votre événement est maintenant organisé par secteurs")
    await go(`${event}/shifts`)
    await page.locator("[data-sector-toggle]").filter({ hasText: "Backline" }).first().scrollIntoViewIfNeeded()
  })
}

// ── SHIFT_SWAPS ─────────────────────────────────────────────────────────────────────────────

export async function recordShiftSwaps(options: Options) {
  const { page, base, title, scene, tap, settle } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const personal = async (key: string) => {
    await page.goto(`${base}/my/${token("swaps", key)}`); await settleDom(page)
    await page.getByRole("heading", { level: 1, name: "Mes inscriptions", exact: true }).waitFor()
    const card = page.locator('[data-swaps-card="1"]')
    await card.waitFor()
    return card
  }
  // The card's status line sits in its always-mounted wrapper (#echanges), above the section.
  const status = (text: RegExp) => page.locator("#echanges").getByRole("status").filter({ hasText: text }).waitFor()
  const publish = async (key: string) => {
    const card = await personal(key)
    await card.scrollIntoViewIfNeeded()
    await tap(page, card.getByRole("button", { name: /^Je cherche à échanger ce créneau/ }))
    await status(/^Demande publiée/)
    await card.getByRole("heading", { name: /^En attente d'une proposition/ }).waitFor()
  }
  const accept = async (key: string, after: RegExp) => {
    const card = await personal(key)
    const offered = card.getByRole("heading", { name: /te propose un échange/ })
    await offered.scrollIntoViewIfNeeded()
    await tap(page, card.getByRole("button", { name: /^Accepter l'échange/ }))
    const confirm = card.getByRole("alertdialog")
    await confirm.waitFor()
    return { confirm, run: async () => { await tap(page, confirm.getByRole("button", { name: "Oui, échanger", exact: true })); await status(after) } }
  }
  const eventSwapsCard = async () => {
    await go(`/admin/events/${EVENT_ID}/edit`)
    return page.locator('[data-event-swaps="1"]')
  }
  let swapsCard = await eventSwapsCard()
  assert.equal(await swapsCard.getByRole("switch", { name: "Autoriser les demandes d'échange de créneaux", exact: true }).getAttribute("aria-checked"), "false", "Swaps fixture already used: run the shift-swaps seed")
  await scene("swaps-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Changer de créneau entre bénévoles, sans tout refaire", duration: 2_400 })
  })
  await scene("swaps-enable", async at => {
    await at("la carte Échanges de créneaux propose")
    await swapsCard.scrollIntoViewIfNeeded()
    await at("Activons-la")
    await tap(page, swapsCard.getByRole("switch", { name: "Autoriser les demandes d'échange de créneaux", exact: true }))
    await swapsCard.getByText(/^Demandes d'échange autorisées/).waitFor()
    await at("Laissons pour l'instant Valider chaque échange désactivé")
    assert.equal(await swapsCard.getByRole("switch", { name: "Valider chaque échange", exact: true }).getAttribute("aria-checked"), "false")
  })
  await scene("swaps-publish", async at => {
    await at("Elle ouvre sa page Mes inscriptions")
    const card = await personal("lea")
    await card.scrollIntoViewIfNeeded()
    await at("Elle choisit Je cherche à échanger ce créneau")
    await tap(page, card.getByRole("button", { name: /^Je cherche à échanger ce créneau/ }))
    await status(/^Demande publiée/)
    await at("Les personnes inscrites sur un autre créneau du même poste")
    await card.getByRole("heading", { name: /^En attente d'une proposition/ }).scrollIntoViewIfNeeded()
  })
  await scene("swaps-offer", async at => {
    await at("Sur sa page, Échanges proposés par d'autres bénévoles")
    const card = await personal("jules")
    const offers = card.getByRole("heading", { level: 3, name: "Échanges proposés par d'autres bénévoles", exact: true })
    await offers.scrollIntoViewIfNeeded()
    assert(!(await card.innerText()).includes("Léa"), "The request must never show the requester's name")
    await at("Jules choisit celui qu'il cède")
    await tap(page, card.locator("label").filter({ has: page.locator('input[type="radio"]') }).filter({ hasText: /de 14h à 18h/ }).first())
    await tap(page, card.getByRole("button", { name: /^Proposer cet échange/ }))
    await status(/^Proposition envoyée/)
    await at("C'est maintenant à Léa de répondre")
    await card.getByRole("heading", { name: /^En attente de la réponse de/ }).scrollIntoViewIfNeeded()
  })
  await scene("swaps-accept", async at => {
    await at("Léa reçoit un email")
    const { confirm, run } = await accept("lea", /^Échange effectué : ton créneau est maintenant Bar Grande Scène, dimanche/)
    await at("Une confirmation récapitule les deux créneaux")
    await confirm.scrollIntoViewIfNeeded()
    await at("Oui, échanger")
    await run()
  })
  const done = await waitForMail(page, "video.beta.lea@example.org", /^Échange effectué : Festival de Montvert$/)
  await scene("swaps-done", async at => {
    await at("Léa a maintenant le créneau du dimanche")
    await page.getByRole("heading", { level: 2, name: "Tous mes créneaux", exact: true }).scrollIntoViewIfNeeded()
    await at("Tous deux reçoivent un email Échange effectué")
    await openMail(page, tap, "video.beta.lea@example.org", done.ID)
  })
  await scene("swaps-approval", async at => {
    await at("Dans les informations de l'événement, activons Valider chaque échange")
    swapsCard = await eventSwapsCard()
    await swapsCard.scrollIntoViewIfNeeded()
    await tap(page, swapsCard.getByRole("switch", { name: "Valider chaque échange", exact: true }))
    await swapsCard.getByText("Chaque échange attendra votre validation.", { exact: true }).waitFor()
  })
  await scene("swaps-sector", async at => {
    await at("Noah est à l'accueil de la Scène du Lac")
    await publish("noah")
    await at("Lou est à l'accueil de la Grande Scène")
    const card = await personal("lou")
    const offer = card.getByRole("heading", { level: 4, name: /^Quelqu'un cède : Accueil Scène du Lac/ })
    await offer.scrollIntoViewIfNeeded()
    await at("Lou propose son créneau")
    await tap(page, card.getByRole("button", { name: /^Proposer cet échange/ }))
    await status(/^Proposition envoyée/)
  })
  await scene("swaps-sector-accept", async at => {
    await at("Noah relit la proposition et l'accepte")
    const { confirm, run } = await accept("noah", /^Échange accepté : il attend maintenant la validation de l'organisation\.$/)
    await at("Cette fois, la confirmation prévient")
    await confirm.getByText(/L'organisation devra encore le valider\./).waitFor()
    await confirm.scrollIntoViewIfNeeded()
    await run()
    await at("Leur planning ne change pas avant cette validation")
    await page.locator('[data-swaps-card="1"]').getByRole("heading", { name: /^En attente de la validation de l'organisation/ }).scrollIntoViewIfNeeded()
  })
  await scene("swaps-validate", async at => {
    await at("Dans Inscriptions, la section Échanges de créneaux")
    await go(`/admin/events/${EVENT_ID}/registrations#echanges`)
    const panel = page.locator('[data-swaps-panel="1"]')
    await panel.scrollIntoViewIfNeeded()
    await panel.getByRole("heading", { level: 3, name: "À valider", exact: true }).waitFor()
    await at("Valider l'échange vérifie à nouveau toutes les règles")
    await tap(page, panel.getByRole("button", { name: /^Valider l'échange/ }).first())
    const dialog = page.getByRole("dialog", { name: "Valider cet échange ?" })
    await dialog.waitFor()
    await tap(page, dialog.getByRole("button", { name: "Valider l'échange", exact: true }))
    await panel.getByText(/^Échange validé et effectué entre /).waitFor()
    await at("Les deux personnes sont prévenues par email")
    await panel.getByText("Aucun échange n'attend votre validation.", { exact: true }).scrollIntoViewIfNeeded()
  })
  await scene("swaps-result", async at => {
    await at("Il se fait avant le début du premier des deux créneaux")
    const card = await personal("noah")
    await card.getByRole("heading", { level: 3, name: "Échanges terminés", exact: true }).scrollIntoViewIfNeeded()
  })
}

// ── SECTOR_LEADERS, sector part ─────────────────────────────────────────────────────────────

/** Appended to the poste-leader story of record.ts, after its last scene: the beta event with sectors. */
export async function recordSectorLeadersBySector(options: Options & { owner: Cookie[] }) {
  const { page, base, scene, tap, settle, typeNaturally, owner } = options
  const leadersUrl = `${base}/admin/events/${EVENT_ID}/sector-leaders`
  const paul = "video.beta.paul@example.org"
  await switchSession(page, owner)
  await page.goto(leadersUrl); await settle(page)
  await page.getByRole("heading", { level: 1, name: "Responsables de poste et de secteur", exact: true }).waitFor()
  assert.equal(await page.getByText("Aucun responsable pour l'instant.", { exact: true }).count(), 1, "Sector leaders fixture already used: run the sector-leaders seed")
  await scene("leaders-sector-scope", async at => {
    await at("Sa page s'appelle Responsables de poste et de secteur")
    await page.getByRole("heading", { level: 1, name: "Responsables de poste et de secteur", exact: true }).scrollIntoViewIfNeeded()
    await at("En ajoutant un responsable, choisissez d'abord Responsable de")
    await tap(page, page.getByRole("button", { name: "+ Ajouter un responsable", exact: true }))
    await page.getByRole("group", { name: "Responsable de", exact: true }).waitFor()
    await at("Confions tout le secteur Parking à Paul")
    await tap(page, page.getByRole("radio", { name: "Tout un secteur", exact: true }))
    const sector = page.getByLabel(/^Secteur/)
    await tap(page, sector); await sector.selectOption({ label: "Parking" })
    await at("Renseignons son nom et son email")
    await typeNaturally(page, page.getByLabel(/^Nom/), "Paul Murphy")
    await typeNaturally(page, page.getByLabel(/^Email/), paul)
    await tap(page, page.getByRole("button", { name: "Ajouter et envoyer le lien", exact: true }))
    await page.getByText("Paul Murphy", { exact: true }).first().waitFor()
  })
  const mail = await waitForMail(page, paul, /^Vous êtes responsable de « Parking »/)
  const detail = await (await page.request.get(`${MAILPIT}/api/v1/message/${mail.ID}`)).json() as { Text: string }
  const link = /https?:\/\/\S+?\/leader\/([A-Za-z0-9_-]+)/.exec(detail.Text)
  assert(link, "The nomination email has no personal leader link")
  await scene("leaders-sector-roster", async at => {
    await at("Le lien personnel de Paul montre tous les postes")
    await page.goto(`${base}/leader/${link[1]}`); await settleDom(page)
    await page.getByRole("heading", { level: 1, name: "Responsable de secteur · Parking", exact: true }).waitFor()
    await at("Parking Nord et Parking Mairie")
    await page.getByRole("heading", { level: 2, name: /^Parking Nord(?:\s|$)/ }).scrollIntoViewIfNeeded()
    await page.getByRole("heading", { level: 2, name: /^Parking Mairie(?:\s|$)/ }).scrollIntoViewIfNeeded()
    assert.equal(await page.getByRole("heading", { level: 2, name: /^Backline Grande Scène(?:\s|$)/ }).count(), 0, "A sector leader sees only the postes of the sector")
    await at("Un filtre Jour limite la liste à une journée")
    await page.evaluate(() => window.scrollTo(0, 0))
    const day = page.getByLabel("Jour", { exact: true })
    await tap(page, day); await day.selectOption({ index: 1 })
    await at("Les bénévoles, eux, ne voient pas les secteurs")
    await day.selectOption({ index: 0 })
  })
}
