// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of WORKLOAD_PROTECTION (#1171): « Protection des pauses et de la charge », in beta, on the
 * dedicated organisation of scripts/seed-video-workload.ts (scenario workload-protection). Every
 * action goes through the real screens, signed in as the owner (record.ts logs in before the
 * screencast). Volunteers use the public page and their personal link (`/my/<token>`), as in their
 * emails. Every take needs its own fresh seed: the take adds a place, sets « Repas sur le pouce »,
 * turns the protection on, saves a personal limit and withdraws one of Sarah's shifts.
 *
 * Labels are those of src/components/admin/EventWorkloadPolicyCard.tsx, WorkloadPolicyFields.tsx,
 * WorkloadBenchmarks.tsx, PersonalLimitsEditor.tsx, shifts/PlacesSection.tsx, shifts/RoleSettings.tsx,
 * src/lib/meal-on-the-go.ts, src/components/public/SignupRecap.tsx, MyWorkloadCard.tsx and
 * src/app/my/[token]/page.tsx. videos/lib/__tests__/workload-fixture.test.ts judges the seeded
 * schedule with these values through the product's evaluator.
 */
import assert from "node:assert/strict"
import type { Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"
import { surnameOf } from "./fixture-names"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Type = (page: Page, field: Locator, value: string) => Promise<void>
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; typeNaturally: Type }

/** Fixed ids and tokens of scripts/seed-video-workload.ts (kept here: the recorder never imports a seed). */
const EVENT_ID = "video-workload-event"
const EVENT_SLUG = "festival-du-lac"
const EVENT_TITLE = "Festival du Lac de Montvert"
const ORG_SLUG = "formation-charge"
const OWNER_EMAIL = "video.workload.owner@example.org"
const token = (key: string) => `demo-workload-${key}-0001`

export const WORKLOAD_OWNER_EMAIL = OWNER_EMAIL

/** What the take types on the card and in the personal limits (the fixture test builds the same policy). */
export const WL_TYPED = { serviceDayStart: "06:00", maxEventHours: "20", maxIdleGapHours: "3", offDayMin: "1", offDayWindow: "3", personalDailyHours: "6" } as const

/** The « Repères et suggestions » buttons the take uses, in order (WORKLOAD_BENCHMARKS' `action`). */
export const WL_BENCHMARK_ACTIONS = [
  "Utiliser 11 h de repos entre deux journées",
  "Utiliser 30 min de repas entre 11 h 30 et 14 h et entre 18 h et 21 h",
  "Utiliser 15 min entre deux lieux",
  "Utiliser les repères pour les moins de 18 ans",
] as const

/** Pages that poll or keep requests open (public page, personal page): DOM, fonts, then a visible landmark. */
async function settleDom(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

export async function recordWorkloadProtection(options: Options) {
  const { page, base, title, scene, tap, settle, typeNaturally } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const event = `/admin/events/${EVENT_ID}`
  const card = page.locator('[data-event-workload="1"]')
  const field = (id: string) => page.locator(`#${id}`)
  const fill = async (target: Locator, value: string) => { await target.scrollIntoViewIfNeeded(); await tap(page, target); await target.fill(value); await page.waitForTimeout(400) }
  const personalPage = async (key: string) => {
    await page.goto(`${base}/my/${token(key)}`); await settleDom(page)
    await page.getByRole("heading", { level: 1, name: "Mes inscriptions", exact: true }).waitFor()
  }

  await go(`${event}/shifts`)
  const places = page.locator('[data-places-section="1"]')
  await places.waitFor()
  assert.equal(await places.getByText("Le Dôme", { exact: true }).count(), 0, "Workload fixture already used: run the workload-protection seed")
  const barMealOff = page.getByRole("button", { name: "Repas : non, poste « Bar Grande Scène » sans repas sur le pouce", exact: true })

  await scene("wl-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Des limites choisies par l'organisation, que personne ne dépasse", duration: 2_400 })
  })

  await scene("wl-places", async at => {
    await at("La section Lieux des missions")
    await places.scrollIntoViewIfNeeded()
    for (const name of ["Grande Scène", "Scène du Lac", "Chapiteau"]) await places.getByText(name, { exact: true }).waitFor()
    await at("Ajoutons Le Dôme")
    await typeNaturally(page, places.getByLabel("Nouveau lieu", { exact: true }), "Le Dôme")
    await tap(page, places.getByRole("button", { name: "Ajouter le lieu", exact: true }))
    await places.getByText("Le Dôme", { exact: true }).waitFor()
    await at("Les bénévoles ne voient pas ces lieux")
    await places.getByText(/^Les lieux où se passent les missions/).scrollIntoViewIfNeeded()
  })

  await scene("wl-meal-on-the-go", async at => {
    await at("Ouvrons Gérer les postes")
    await tap(page, page.getByRole("button", { name: "Gérer les postes", exact: true }))
    await barMealOff.scrollIntoViewIfNeeded()
    await tap(page, barMealOff)
    await at("Cochons repas sur le pouce possible")
    const box = page.getByLabel("Poste « Bar Grande Scène » : repas sur le pouce possible sur ses créneaux", { exact: true })
    await tap(page, box)
    assert(await box.isChecked())
    await tap(page, page.locator("form").filter({ has: box }).getByRole("button", { name: "Enregistrer", exact: true }))
    await at("Le bouton indique maintenant")
    await page.getByRole("button", { name: "Repas : sur le pouce, poste « Bar Grande Scène », possible sur tous ses créneaux", exact: true }).scrollIntoViewIfNeeded()
  })

  await go(`${event}/edit`)
  await card.waitFor()
  assert.equal((await card.locator('[data-workload-state="1"]').innerText()).trim(), "Désactivée", "Workload fixture already used: run the workload-protection seed")

  await scene("wl-card", async at => {
    await at("La carte Protection des pauses")
    await card.getByRole("heading", { level: 2, name: /^Protection des pauses et de la charge/ }).scrollIntoViewIfNeeded()
    await at("Aucune valeur n'est imposée")
    await card.getByText(/^Vous choisissez chaque limite\./).scrollIntoViewIfNeeded()
  })

  await scene("wl-service-day", async at => {
    await at("Tapons six heures")
    await fill(field("event-wl-serviceDayStart"), WL_TYPED.serviceDayStart)
    await at("Des exemples apparaissent aussitôt")
    await card.getByText("Une journée de service va de 6 h à 6 h le lendemain.", { exact: true }).scrollIntoViewIfNeeded()
  })

  await scene("wl-limits", async at => {
    await at("Reprendre les réglages d'avertissement existants")
    const suggest = card.getByRole("button", { name: "Reprendre les réglages d'avertissement existants", exact: true })
    await suggest.scrollIntoViewIfNeeded()
    await tap(page, suggest)
    assert.equal(await field("event-wl-maxContinuousMinutes-hours").inputValue(), "6")
    assert.equal(await field("event-wl-minBreakMinutes-minutes").inputValue(), "30")
    assert.equal(await field("event-wl-maxDailyMinutes-hours").inputValue(), "8")
    await field("event-wl-maxContinuousMinutes-hours").scrollIntoViewIfNeeded()
    await at("Complétons vingt heures")
    await typeNaturally(page, field("event-wl-maxEventMinutes-hours"), WL_TYPED.maxEventHours)
    await typeNaturally(page, field("event-wl-maxIdleGapMinutes-hours"), WL_TYPED.maxIdleGapHours)
    assert.equal(await field("event-wl-maxEventMinutes-hours").inputValue(), "20")
    assert.equal(await field("event-wl-maxIdleGapMinutes-hours").inputValue(), "3")
  })

  await scene("wl-benchmarks", async at => {
    const benchmarks = card.locator('[data-workload-benchmarks="1"]')
    await at("Ouvrons Repères et suggestions")
    await benchmarks.scrollIntoViewIfNeeded()
    await tap(page, benchmarks.locator("summary"))
    await at("Chaque repère indique sa source")
    await benchmarks.getByText(/^Source : Directive européenne 2003\/88\/CE/).scrollIntoViewIfNeeded()
    const use = async (action: string) => {
      const button = benchmarks.getByRole("button", { name: action, exact: true })
      await button.scrollIntoViewIfNeeded()
      await tap(page, button)
      await card.getByRole("status").filter({ hasText: /^Rempli : / }).waitFor()
    }
    await at("Utilisons onze heures de repos")
    await use(WL_BENCHMARK_ACTIONS[0])
    await at("Puis trente minutes de repas")
    await use(WL_BENCHMARK_ACTIONS[1])
    await at("Quinze minutes entre deux lieux")
    await use(WL_BENCHMARK_ACTIONS[2])
    await at("Et les repères pour les moins")
    await use(WL_BENCHMARK_ACTIONS[3])
    assert.equal(await field("event-wl-minRestMinutes-hours").inputValue(), "11")
  })

  const offDay = card.locator('[data-workload-offday="1"]')
  await scene("wl-offday", async at => {
    await offDay.scrollIntoViewIfNeeded()
    await at("Appliquons la règle")
    await tap(page, field("event-wl-offDay-yes"))
    await at("au moins un jour sans mission")
    await typeNaturally(page, field("event-wl-offDay-minOffDays"), WL_TYPED.offDayMin)
    await typeNaturally(page, field("event-wl-offDay-windowDays"), WL_TYPED.offDayWindow)
    await at("L'exemple relit les dates")
    const example = field("event-wl-offDay-example").filter({ hasText: /il compte 3 journées de service \(du vendredi .+ au dimanche .+\) : chaque période de 3 journées d'affilée y est vérifiée\.$/ })
    await example.waitFor()
    await example.scrollIntoViewIfNeeded()
  })

  await scene("wl-meal-travel", async at => {
    await at("La pause repas est déjà remplie")
    const meal = card.locator('[data-workload-meal="1"]')
    await meal.scrollIntoViewIfNeeded()
    assert(await field("event-wl-meal-yes").isChecked())
    assert.equal(await field("event-wl-meal-minutes").inputValue(), "30")
    assert(await field("event-wl-meal-days-all").isChecked())
    await at("Le trajet entre deux lieux demande")
    const travel = card.locator('[data-workload-travel="1"]')
    await travel.scrollIntoViewIfNeeded()
    assert.equal(await field("event-wl-travel-minutes").inputValue(), "15")
    await at("La carte signale qu'un créneau")
    await travel.getByText("1 créneau n'a pas de lieu : son trajet n'est pas vérifié.", { exact: true }).scrollIntoViewIfNeeded()
    await travel.getByRole("link", { name: "Choisir les lieux dans Créneaux", exact: true }).waitFor()
  })

  await scene("wl-minors", async at => {
    const minors = card.locator('[data-workload-minors="1"]')
    await minors.scrollIntoViewIfNeeded()
    assert(await field("event-wl-minors-yes").isChecked())
    assert.equal(await field("event-wl-minorsMaxDailyMinutes-hours").inputValue(), "8")
    await at("Sous chacune")
    await minors.getByText(/^Événement : /).first().scrollIntoViewIfNeeded()
    await at("Une personne déjà inscrite")
    await minors.getByText(/^8 personnes inscrites n'ont pas de date de naissance/).scrollIntoViewIfNeeded()
  })

  const people = card.locator('[data-workload-people="1"]')
  await scene("wl-preview", async at => {
    await at("L'encadré En résumé")
    await card.getByRole("heading", { level: 3, name: "En résumé", exact: true }).scrollIntoViewIfNeeded()
    await at("Avant d'activer")
    await tap(page, card.getByRole("button", { name: "Aperçu", exact: true }))
    await card.getByRole("status").filter({ hasText: "Aperçu : 1 personne dépasserait ces limites. Rien n'est encore activé." }).waitFor()
    await at("Noah est inscrit")
    await people.getByText("Noah De Jong", { exact: true }).scrollIntoViewIfNeeded()
    assert.equal(await people.getByRole("heading", { level: 3 }).innerText(), "Aperçu : programmes qui dépasseraient ces limites")
  })

  await scene("wl-refused", async at => {
    await at("Essayons tout de même")
    const activate = card.getByRole("button", { name: "Activer la protection", exact: true })
    await activate.scrollIntoViewIfNeeded()
    await tap(page, activate)
    await card.getByRole("alert").filter({ hasText: /^Ces limites ne sont pas respectées aujourd'hui par le programme de Noah De Jong\./ }).waitFor()
    assert.equal((await card.locator('[data-workload-state="1"]').innerText()).trim(), "Désactivée")
    await at("La carte liste les programmes")
    await people.getByRole("heading", { level: 3, name: "Programmes à modifier d'abord", exact: true }).scrollIntoViewIfNeeded()
  })

  await scene("wl-activate", async at => {
    await at("Choisissons Ne pas appliquer")
    await offDay.scrollIntoViewIfNeeded()
    await tap(page, field("event-wl-offDay-no"))
    assert(await field("event-wl-offDay-no").isChecked())
    // Keep the actual chosen rule in the screencast before scrolling to Aperçu.
    await field("event-wl-offDay-no").scrollIntoViewIfNeeded()
    await page.waitForTimeout(700)
    await tap(page, card.getByRole("button", { name: "Aperçu", exact: true }))
    await card.getByRole("status").filter({ hasText: "Aperçu : aucun programme actuel ne dépasse ces limites. Rien n'est encore activé." }).waitFor()
    await at("Activons la protection")
    await tap(page, card.getByRole("button", { name: "Activer la protection", exact: true }))
    await card.getByRole("status").filter({ hasText: "Protection activée : toute affectation qui dépasse ces limites est désormais refusée." }).waitFor()
    await at("Désormais")
    await card.locator('[data-workload-state="1"]').filter({ hasText: /^Activée : toute affectation qui dépasse ces limites est refusée\.$/ }).scrollIntoViewIfNeeded()
  })

  await scene("wl-personal", async at => {
    const personal = card.locator('[data-personal-limits="1"]')
    await personal.getByText("Aucune limite personnelle pour l'instant.", { exact: true }).waitFor()
    await personal.scrollIntoViewIfNeeded()
    await at("Choisissons Camille")
    await tap(page, personal.getByRole("button", { name: "Ajouter des limites pour une personne", exact: true }))
    const who = field("event-wl-person-who")
    await tap(page, who); await who.selectOption({ label: "Camille Rossi" })
    await typeNaturally(page, field("event-wl-person-personalMaxDailyMinutes-hours"), WL_TYPED.personalDailyHours)
    await tap(page, personal.getByRole("button", { name: "Enregistrer les limites de la personne", exact: true }))
    await personal.getByRole("status").filter({ hasText: "Limites de Camille Rossi enregistrées." }).waitFor()
    await at("Une limite personnelle n'est jamais")
    await personal.getByText("Camille Rossi", { exact: true }).scrollIntoViewIfNeeded()
  })

  await scene("wl-signup", async at => {
    await page.goto(`${base}/${EVENT_SLUG}?org=${ORG_SLUG}`); await settleDom(page)
    await page.getByRole("heading", { level: 1, name: EVENT_TITLE, exact: true }).waitFor()
    await at("Elle choisit l'accueil du Chapiteau")
    const saturday = page.getByRole("region", { name: /^Planning du samedi/i })
    await saturday.scrollIntoViewIfNeeded()
    await tap(page, saturday.getByRole("button", { name: /, Accueil Chapiteau : sélectionner/ }))
    await tap(page, saturday.getByRole("button", { name: /, Bar Grande Scène : sélectionner/ }))
    await tap(page, page.getByRole("button", { name: /^Continuer/ }).filter({ visible: true }).first())
    await page.getByRole("heading", { name: "Tes informations", exact: true }).waitFor()
    await at("Avant même de confirmer")
    const recap = page.getByText("Ces créneaux dépassent les limites de l'événement", { exact: true }).filter({ visible: true }).first()
    await recap.scrollIntoViewIfNeeded()
    await at("Emma remplit tout de même")
    // This complete form follows the recap sentence. Direct input keeps the
    // actual refusal inside its narrated chapter; fill emits no invented keys.
    // Fill focuses each real input without an invented click or key event.
    // Four full touch-marker animations delayed the refusal past its sentence.
    for (const [id, value] of [["reg-firstname", "Emma"], ["reg-lastname", surnameOf("Emma")], ["reg-email", "video.workload.emma@example.org"], ["reg-birthdate", "1994-03-14"]]) {
      await field(id).scrollIntoViewIfNeeded()
      await field(id).fill(value)
      await page.waitForTimeout(150)
    }
    await tap(page, field("reg-charter"))
    await tap(page, field("reg-consent"))
    const response = page.waitForResponse(item => item.url().endsWith("/api/public/registrations") && item.request().method() === "POST")
    await tap(page, page.getByRole("button", { name: "Confirmer mon inscription", exact: true }))
    assert.equal((await response).status(), 409)
    await at("L'inscription est refusée")
    const failure = page.locator("#signup-failure")
    await failure.getByText(/^Inscription impossible : les pauses et limites de charge de cet événement ne seraient pas respectées\./).waitFor()
    await failure.scrollIntoViewIfNeeded()
  })

  await scene("wl-withdraw", async at => {
    await personalPage("sarah")
    assert.equal(await page.locator('[data-my-workload="1"]').count(), 0, "Sarah's programme must respect the limits before her withdrawal")
    await at("Dimanche, Sarah est inscrite")
    await page.getByRole("heading", { level: 2, name: "Tous mes créneaux", exact: true }).scrollIntoViewIfNeeded()
    await at("Sur sa page Mes inscriptions")
    const cancel = page.getByRole("button", { name: "Annuler le créneau Accueil Chapiteau", exact: true })
    await cancel.scrollIntoViewIfNeeded()
    await tap(page, cancel)
    const confirm = page.getByRole("alertdialog", { name: "Confirmer l'annulation ?" })
    await confirm.waitFor()
    await tap(page, confirm.getByRole("button", { name: "Oui, annuler", exact: true }))
    await cancel.waitFor({ state: "detached" })
    await at("Entre le matin et le soir")
    await page.getByRole("heading", { level: 2, name: "Tous mes créneaux", exact: true }).scrollIntoViewIfNeeded()
  })

  await scene("wl-registrations", async at => {
    await at("Dans Inscriptions")
    await go(`${event}/registrations`)
    const flagged = page.getByText("Limite dépassée :", { exact: true })
    await flagged.first().waitFor()
    assert.equal(await flagged.count(), 2, "Sarah's two remaining rows carry the finding")
    // Centre the two actual findings together before naming Sarah's remaining rows.
    await flagged.evaluateAll(nodes => {
      const boxes = nodes.map(node => (node.closest("tr") ?? node).getBoundingClientRect())
      const top = Math.min(...boxes.map(box => box.top))
      const bottom = Math.max(...boxes.map(box => box.bottom))
      window.scrollBy(0, (top + bottom) / 2 - window.innerHeight / 2)
    })
    await page.waitForTimeout(400)
    assert(await flagged.evaluateAll(nodes => nodes.every(node => {
      const box = (node.closest("tr") ?? node).getBoundingClientRect()
      return box.top >= 0 && box.bottom <= window.innerHeight && box.left >= 0 && box.right <= window.innerWidth
    })), "Both of Sarah's Limite dépassée rows must be inside the viewport during the narration")
  })

  await scene("wl-my-card", async at => {
    await personalPage("sarah")
    const mine = page.locator('[data-my-workload="1"]')
    await mine.getByRole("heading", { level: 2, name: "Pauses et charge", exact: true }).waitFor()
    await mine.scrollIntoViewIfNeeded()
    await at("Juste en dessous")
    await page.locator('[data-my-workload-limits="1"]').getByRole("heading", { level: 2, name: "Mes limites", exact: true }).scrollIntoViewIfNeeded()
  })

  await scene("wl-result", async () => {
    await go(`${event}/edit`)
    await card.getByRole("link", { name: "1 programme à revoir", exact: true }).waitFor()
    // The card is taller than a viewport: centering its container hid its state.
    const heading = card.getByRole("heading", { level: 2, name: /^Protection des pauses et de la charge/ })
    await heading.scrollIntoViewIfNeeded()
    // Fail the take if the actual state and programme link cannot share this frame.
    for (const target of [heading, card.locator('[data-workload-state="1"]'), card.getByRole("link", { name: "1 programme à revoir", exact: true })]) {
      const bounds = await target.boundingBox()
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize()!.height, "Final workload heading, active state and programme link must all be in frame")
    }
  })
}
