// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of ASSIGNMENT_PROPOSALS (#1172): « Proposition d'affectations », in beta, on the dedicated
 * organisation of scripts/seed-video-proposals.ts (scenario assignment-proposals). Every action goes
 * through the real screens, signed in as the owner (record.ts logs in before the screencast). Every
 * take needs its own fresh seed: the take stores hour targets, generates a proposal (written into
 * the drafts), locks one draft, removes one and adds one by hand. It opens the publication
 * confirmation and cancels it: nothing is published, no email is sent.
 *
 * Labels are those of src/app/admin/events/[id]/availability/page.tsx, drafts/page.tsx,
 * proposal/page.tsx, src/components/admin/ProposalWorkspace.tsx, DraftBoard.tsx and
 * src/lib/proposal-explanations.ts. videos/lib/__tests__/proposals-fixture.test.ts runs the
 * product's solver on the seeded input with AP_TYPED and checks every AP_EXPECTED line.
 */
import assert from "node:assert/strict"
import type { Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"
import { fullNameOf } from "./fixture-names"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Type = (page: Page, field: Locator, value: string) => Promise<void>
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; typeNaturally: Type }

/** Fixed ids of scripts/seed-video-proposals.ts (kept here: the recorder never imports a seed). */
const EVENT_ID = "video-proposals-event"
const OWNER_EMAIL = "video.proposals.owner@example.org"
const person = (key: string) => `video-proposals-person-${key}`

export const PROPOSALS_OWNER_EMAIL = OWNER_EMAIL

/** What the take chooses and types (the fixture test builds the same configuration). */
export const AP_TYPED = {
  seed: "2026",
  target: { key: "noah", firstName: "Noah", hours: "6" },
  prefer: { key: "emma", firstName: "Emma", poste: "Bar des Tilleuls" },
  avoid: { key: "lucas", firstName: "Lucas", poste: "Parking" },
  /** Locked: Emma's Friday draft at the bar. */
  locked: { key: "emma", firstName: "Emma", poste: "Bar des Tilleuls", day: 0 },
  /** Adjusted by hand: Léa's Friday ticket office draft removed, Lou added on that shift. */
  removed: { key: "lea", firstName: "Léa", poste: "Billetterie", day: 0 },
  added: { key: "lou", firstName: "Lou", poste: "Billetterie", day: 0 },
  /** Asked, never answered: listed, not included. */
  unanswered: { key: "jules", firstName: "Jules" },
} as const

/** What the screens must show for the narration to hold (checked by the fixture test and during the take). */
export const AP_EXPECTED = {
  countLine: "14 créneaux, 31 places à pourvoir",
  state: "Impossible démontré",
  covered: "29 places couvertes sur 31",
  written: "29 affectations écrites dans les brouillons.",
  gapPoste: "Rangement du Kiosque",
  gapReason: "Aucune disponibilité ne couvre entièrement ce créneau.",
  targetLoad: "6 h prévues pour un objectif de 6 h : objectif atteint.",
  wishSentence: "Disponible sur tout le créneau. Place du minimum de ce créneau. Charge prévue : 8 h pour un objectif de 12 h. Poste souhaité.",
  drafts: "29 affectations en brouillon pour 11 personnes.",
} as const

export async function recordAssignmentProposals(options: Options) {
  const { page, base, title, scene, tap, settle } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const event = `/admin/events/${EVENT_ID}`
  const exact = { exact: true } as const
  const rowOf = (key: string) => page.locator("tr").filter({ has: page.locator(`#pt-name-${person(key)}`) })
  /** The planning cell of a person on the n-th date of the event (wide layout). */
  const cellOf = (key: string, day: number) => page.locator(`[id^="grid-cell-${person(key)}-"]`).nth(day)

  await go(`${event}/availability`)
  await page.getByRole("heading", { level: 1, name: "Disponibilités", exact: true }).waitFor()

  await scene("ap-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Un planning proposé en brouillon, que vous relisez avant de publier", duration: 2_400 })
  })

  await scene("ap-drafts", async at => {
    await at("Depuis la page Disponibilités")
    await tap(page, page.getByRole("link", { name: "Affectations en brouillon", exact: true }).first())
    await page.waitForURL(/\/availability\/drafts$/); await settle(page)
    await page.getByText("Aucune affectation en brouillon pour l'instant.", exact).waitFor()
    assert.equal(await page.getByText("Proposé", exact).count(), 0, "Proposals fixture already used: run the assignment-proposals seed")
    await at("une ligne par personne")
    await page.getByRole("region", { name: "Planning des affectations" }).scrollIntoViewIfNeeded()
    await at("Cliquons sur Générer une proposition")
    await page.getByRole("heading", { level: 1, name: "Affectations en brouillon", exact: true }).scrollIntoViewIfNeeded()
    await tap(page, page.getByRole("link", { name: "Générer une proposition", exact: true }))
    await page.waitForURL(/\/availability\/proposal$/); await settle(page)
  })

  await scene("ap-scope", async at => {
    const checks = page.getByRole("heading", { level: 2, name: "Ce qui est vérifié", exact: true })
    await checks.scrollIntoViewIfNeeded()
    await page.getByText("Protection des pauses et de la charge : activée.", exact).waitFor()
    await at("Dans Périmètre")
    const scope = page.getByRole("heading", { level: 2, name: "Périmètre", exact: true })
    await scope.scrollIntoViewIfNeeded()
    for (const box of await page.locator("#proposal-dates input[type=checkbox], #proposal-postes input[type=checkbox]").all()) assert(await box.isChecked(), "every date and poste starts checked")
    assert.equal(await page.locator("#proposal-dates input[type=checkbox]").count(), 3)
    assert.equal(await page.locator("#proposal-postes input[type=checkbox]").count(), 5)
    await page.getByText(AP_EXPECTED.countLine, exact).scrollIntoViewIfNeeded()
  })

  await scene("ap-targets", async at => {
    await at("Jules n'a pas répondu")
    const jules = rowOf(AP_TYPED.unanswered.key)
    await jules.scrollIntoViewIfNeeded()
    await jules.getByText("Sans réponse", exact).waitFor()
    assert.equal(await jules.locator("input[type=checkbox]").isChecked(), false, "Jules is not included")
    await at("Appliquer la suggestion remplit")
    await tap(page, page.getByRole("button", { name: "Appliquer la suggestion : 6 h par date où la personne a indiqué une plage libre", exact: true }))
    const noah = page.locator(`#target-${person(AP_TYPED.target.key)}`)
    assert.equal(await noah.inputValue(), "12", "Noah's suggestion: two available dates")
    await at("Noah ne veut que six heures")
    await noah.scrollIntoViewIfNeeded()
    await tap(page, noah)
    await noah.fill("")
    await noah.pressSequentially(AP_TYPED.target.hours, { delay: 95 })
    assert.equal(await noah.inputValue(), AP_TYPED.target.hours)
  })

  await scene("ap-wishes", async at => {
    await at("Pour Emma")
    const prefer = page.getByRole("combobox", { name: `Poste souhaité ${fullNameOf(AP_TYPED.prefer.firstName)}`, exact: true })
    await prefer.scrollIntoViewIfNeeded()
    await tap(page, prefer)
    await prefer.selectOption({ label: AP_TYPED.prefer.poste })
    await at("pour Lucas")
    const avoid = page.locator(`#avoid-${person(AP_TYPED.avoid.key)}`)
    await tap(page, avoid)
    await avoid.selectOption({ label: AP_TYPED.avoid.poste })
    await at("Ces souhaits passent après")
    await rowOf(AP_TYPED.prefer.key).scrollIntoViewIfNeeded()
  })

  await scene("ap-launch", async at => {
    await at("Dans Paramètres de calcul")
    const details = page.locator("details").filter({ has: page.locator("summary", { hasText: "Paramètres de calcul" }) })
    await tap(page, details.locator("summary"))
    const seed = page.locator("#proposal-seed")
    await tap(page, seed)
    await seed.fill("")
    await seed.pressSequentially(AP_TYPED.seed, { delay: 95 })
    assert.equal(await seed.inputValue(), AP_TYPED.seed)
    await at("Puis Générer une proposition")
    await tap(page, page.getByRole("button", { name: "Générer une proposition", exact: true }))
  })

  const result = page.locator("section").filter({ has: page.locator("#proposal-result") })
  await scene("ap-result", async at => {
    await page.getByRole("heading", { level: 2, name: "Résultat de la proposition", exact: true }).waitFor({ timeout: 40_000 })
    await result.getByText(AP_EXPECTED.written, exact).waitFor({ timeout: 20_000 })
    await page.getByRole("heading", { level: 2, name: "Résultat de la proposition", exact: true }).scrollIntoViewIfNeeded()
    await result.getByText(AP_EXPECTED.covered, exact).waitFor()
    await at("Impossible démontré")
    await result.getByText(AP_EXPECTED.state, exact).waitFor()
    const gaps = result.getByRole("heading", { level: 3, name: "Places restées vides (1)", exact: true })
    await gaps.scrollIntoViewIfNeeded()
    await result.locator("li").filter({ hasText: AP_EXPECTED.gapPoste }).filter({ hasText: AP_EXPECTED.gapReason }).waitFor()
  })

  await scene("ap-load", async at => {
    await at("La charge par personne")
    const load = page.getByRole("region", { name: "Charge par personne" })
    await load.scrollIntoViewIfNeeded()
    const noah = load.locator("tr").filter({ has: page.getByRole("rowheader", { name: fullNameOf(AP_TYPED.target.firstName), exact: true }) })
    await noah.getByText(AP_EXPECTED.targetLoad, exact).waitFor()
    await noah.scrollIntoViewIfNeeded()
    await at("Dans Affectations proposées")
    const summary = result.locator("summary", { hasText: /^Affectations proposées \(29\)$/ })
    await tap(page, summary)
    await at("Emma est au bar vendredi")
    const line = result.locator("li").filter({ hasText: `${fullNameOf(AP_TYPED.prefer.firstName)}, ${AP_TYPED.prefer.poste}, vendredi` })
    await line.filter({ hasText: AP_EXPECTED.wishSentence }).waitFor()
    await line.scrollIntoViewIfNeeded()
  })

  await scene("ap-lock", async at => {
    await at("De retour au planning")
    await tap(page, page.getByRole("link", { name: "Voir les affectations en brouillon", exact: true }))
    await page.waitForURL(/\/availability\/drafts$/); await settle(page)
    await page.getByText(AP_EXPECTED.drafts, exact).waitFor()
    const emma = cellOf(AP_TYPED.locked.key, AP_TYPED.locked.day)
    await emma.scrollIntoViewIfNeeded()
    await emma.getByText("Proposé", exact).waitFor()
    await at("Ouvrons celui d'Emma")
    await tap(page, emma.getByRole("button", { name: new RegExp(`^Voir le brouillon\\W+${fullNameOf(AP_TYPED.locked.firstName)}, ${AP_TYPED.locked.poste},`) }))
    const dialog = page.getByRole("dialog", { name: new RegExp(`^Brouillon : ${AP_TYPED.locked.poste}, vendredi`) })
    await dialog.waitFor()
    await tap(page, dialog.getByRole("button", { name: "Verrouiller", exact: true }))
    await dialog.getByText(/^Ce brouillon est verrouillé\./).waitFor()
    await at("une nouvelle proposition ne le remplacera pas")
    await dialog.getByText("Une nouvelle proposition ne remplace jamais un brouillon verrouillé.", exact).waitFor()
    await page.waitForTimeout(600)
    await tap(page, dialog.getByRole("button", { name: "Fermer", exact: true }))
    await dialog.waitFor({ state: "detached" })
    await emma.getByText("Verrouillé", exact).waitFor()
  })

  await scene("ap-adjust", async at => {
    await at("Léa doit partir plus tôt vendredi")
    const lea = cellOf(AP_TYPED.removed.key, AP_TYPED.removed.day)
    await lea.scrollIntoViewIfNeeded()
    const open = lea.getByRole("button", { name: new RegExp(`^Voir le brouillon\\W+${fullNameOf(AP_TYPED.removed.firstName)}, ${AP_TYPED.removed.poste},`) })
    await tap(page, open)
    const dialog = page.getByRole("dialog", { name: new RegExp(`^Brouillon : ${AP_TYPED.removed.poste}, vendredi`) })
    await dialog.waitFor()
    await tap(page, dialog.getByRole("button", { name: "Retirer ce brouillon", exact: true }))
    await dialog.waitFor({ state: "detached" })
    await open.waitFor({ state: "detached" })
    await at("Dans la case de Lou")
    const lou = cellOf(AP_TYPED.added.key, AP_TYPED.added.day)
    await lou.scrollIntoViewIfNeeded()
    await tap(page, lou.getByRole("button", { name: /^Ajouter/ }))
    const options = page.getByRole("dialog", { name: new RegExp(`^Ajouter une affectation pour ${fullNameOf(AP_TYPED.added.firstName)}, vendredi`) })
    await options.waitFor()
    const add = options.getByRole("button", { name: new RegExp(`^Ajouter en brouillon\\W+${AP_TYPED.added.poste},`) })
    await add.waitFor()
    // By its heading: once added, the button gives way to « Brouillon ajouté. ».
    const option = options.locator("li").filter({ has: page.getByRole("heading", { level: 3, name: new RegExp(`^${AP_TYPED.added.poste},`) }) })
    assert.equal(await option.getByText(/^Une fois publié avec ses autres brouillons/).count(), 0, "Lou's programme stays within the limits")
    await tap(page, add)
    await option.getByText("Brouillon ajouté.", exact).waitFor()
    await at("Une proposition ne remplace jamais")
    await page.waitForTimeout(700)
    await tap(page, options.getByRole("button", { name: "Fermer", exact: true }))
    await options.waitFor({ state: "detached" })
    await lou.getByText(AP_TYPED.added.poste, exact).waitFor()
  })

  await scene("ap-publish", async at => {
    const heading = page.getByRole("heading", { level: 2, name: "Publier les affectations", exact: true })
    await heading.scrollIntoViewIfNeeded()
    await page.getByText(AP_EXPECTED.drafts, exact).waitFor()
    await at("Publier les affectations demande une confirmation")
    await tap(page, page.getByRole("button", { name: "Publier les affectations", exact: true }))
    const confirm = page.getByRole("dialog", { name: "Publier les affectations ?" })
    await confirm.waitFor()
    await confirm.getByText(/^29 affectations pour 11 personnes : chaque personne avec une adresse email reçoit un seul email avec ses missions\.$/).waitFor()
    await at("Annulons ici")
    await tap(page, confirm.getByRole("button", { name: "Annuler", exact: true }))
    await confirm.waitFor({ state: "detached" })
    await at("Tant que vous ne publiez pas")
    // Nothing was published: the heading, the counts and the button share the final frame.
    for (const target of [heading, page.getByText(AP_EXPECTED.drafts, exact), page.getByRole("button", { name: "Publier les affectations", exact: true })]) {
      const bounds = await target.boundingBox()
      assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize()!.height, "Final publish heading, counts and button must all be in frame")
    }
  })
}
