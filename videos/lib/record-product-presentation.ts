// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of PRODUCT_PRESENTATION, « benevol.app en deux minutes »: the story of a village fête,
 * from the preparation to the review, on the demo organisation (scripts/seed-demo.ts, « Fête du
 * village de Montvert », its owner Élodie). Every screen is a real one: the organiser's pages
 * (duplicate, frise, staffing, messages, documents), and a real public sign-up by Léa, a cast name
 * on example.org. record.ts signs in as the demo owner before the screencast. Every take needs a
 * fresh demo seed: the take adds Léa's registration request.
 *
 * Labels are those of src/app/admin/events/[id]/{duplicate,staffing,message,print}/page.tsx,
 * src/components/admin/TargetedMessageForm.tsx and the public sign-up journey already filmed by
 * VOLUNTEER_REGISTER (videos/tools/record.ts).
 */
import type { Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"
import { fullNameOf } from "./fixture-names"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Fill = (page: Page, field: Locator, value: string, pauseMs?: number) => Promise<void>
type Options = { page: Page; base: string; publicUrl: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; fill: Fill }

const EVENT_TITLE = "Fête du village de Montvert"
/** The volunteer of the story: a cast name (videos/lib/fixture-names.ts), on example.org. */
const VOLUNTEER = { firstName: "Léa", email: "lea.presentation@example.org", phone: "079 000 34 56" }

/** The public page keeps requests open: DOM, fonts, then its title. */
async function settleDom(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

export async function recordProductPresentation(options: Options) {
  const { page, base, publicUrl, title, scene, tap, settle, fill } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const heading = (name: string) => page.getByRole("heading", { level: 1, name, exact: true })

  await go("/admin/events")
  const href = await page.getByRole("link", { name: EVENT_TITLE }).first().getAttribute("href")
  if (!href) throw new Error("Demo event not found: run scripts/seed-demo.ts on the local video database")
  const event = `/admin/events/${href.split("/").filter(Boolean).at(-1)}`

  // A hook of the second voice: a full-screen card while it speaks, then the story goes on.
  const card = (id: string, cardTitle: string, description: string) => scene(id, async () => {
    await page.screencast.showChapter(cardTitle, { description, duration: 600 })
  })

  await go(event)
  await scene("p-hook", async () => {
    await page.screencast.showChapter(title, { description: "Des dizaines de bénévoles. Une seule fête.", duration: 2_800 })
  })
  await scene("p-elodie", async () => {
    await heading(EVENT_TITLE).waitFor()
  })

  // Preparing: last year's fête taken up again, the day on the frise, a demanding poste.
  await card("p-prepare-hook", "Préparer", "Sans repartir de zéro")
  await scene("p-prepare", async at => {
    await at("Elle reprend la fête de l'an dernier")
    await go(`${event}/duplicate`)
    await heading("Dupliquer l'événement").waitFor()
    await at("Sur la frise")
    await go(`${event}/shifts`)
    await page.getByRole("button", { name: /Buvette/ }).filter({ visible: true }).first().scrollIntoViewIfNeeded()
    await at("Une navette réservée aux plus de vingt et un ans")
    await page.getByRole("button", { name: /Navette|Chauffeur navette/ }).filter({ visible: true }).first().scrollIntoViewIfNeeded()
  })

  // Léa signs up through the shared link, for real.
  const organizerCookies = await page.context().cookies()
  await card("p-volunteers-hook", "Un lien, c'est tout", "Les bénévoles choisissent eux-mêmes leurs créneaux")
  await scene("p-signup", async at => {
    await at("Élodie partage un seul lien")
    await page.goto(publicUrl); await settleDom(page)
    await heading(EVENT_TITLE).waitFor()
    await at("Léa l'ouvre")
    const morning = page.getByRole("button", { name: /^09h–12h.*Accueil.*sélectionner/ }).filter({ visible: true }).first()
    await morning.scrollIntoViewIfNeeded()
    await tap(page, morning)
    await tap(page, page.getByRole("button", { name: /^Continuer/ }).filter({ visible: true }).first())
    await page.getByRole("heading", { name: "Tes informations" }).waitFor()
    await fill(page, page.getByRole("textbox", { name: "Prénom", exact: true }), VOLUNTEER.firstName, 80)
    await fill(page, page.getByRole("textbox", { name: "Nom", exact: true }), fullNameOf(VOLUNTEER.firstName).split(" ").slice(1).join(" "), 80)
    await fill(page, page.getByRole("textbox", { name: "Email", exact: true }), VOLUNTEER.email, 80)
    await fill(page, page.getByRole("textbox", { name: /Téléphone/, exact: true }), VOLUNTEER.phone, 80)
    const size = page.getByRole("radio", { name: "M", exact: true })
    if (await size.count()) { await size.scrollIntoViewIfNeeded(); await tap(page, size) }
    const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
    if (await charter.count()) await tap(page, charter)
    await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
    const submit = page.getByRole("button", { name: "Confirmer mon inscription" })
    await submit.scrollIntoViewIfNeeded()
    await tap(page, submit)
    await page.waitForURL(/\/success/, { timeout: 20_000 }); await settleDom(page)
    await at("Pas de compte, pas de mot de passe")
    await page.getByRole("heading", { level: 1 }).first().scrollIntoViewIfNeeded()
  })
  await card("p-free", "Gratuit", "Et sans compte pour les bénévoles")

  // Following: where people are missing, then a message from a template.
  await page.context().addCookies(organizerCookies)
  await scene("p-follow", async at => {
    await at("voit tout de suite où il manque du monde")
    await go(`${event}/staffing`)
    await heading("Où manque-t-il du monde ?").waitFor()
    await at("Pour trouver du renfort")
    await go(`${event}/message`)
    await heading("Messages").waitFor()
    const template = page.getByLabel(/^(Partir d'un modèle|Modèle)$/).first()
    await template.scrollIntoViewIfNeeded()
    await tap(page, template)
    await template.selectOption({ index: 1 })
    await page.waitForTimeout(600)
  })

  // The day before and after the fête: the documents, the review.
  await card("p-dayof-hook", "Le jour J", "Tout est prêt")
  await scene("p-print-after", async at => {
    await at("La veille")
    await go(`${event}/print`)
    await heading("Documents à imprimer").waitFor()
    await page.getByRole("heading", { level: 2, name: "Badges", exact: true }).scrollIntoViewIfNeeded()
    await at("Et après la fête")
    // The heading at the top of the viewport, so the volunteer and hour figures below it are on screen.
    const summary = page.getByRole("region", { name: "Résumé de l'événement" })
    await summary.evaluate(element => element.scrollIntoView({ block: "start", behavior: "smooth" }))
    await summary.getByRole("heading", { level: 3, name: "Heures", exact: true }).waitFor()
    await page.waitForTimeout(800)
  })

  // The call to action: an end card held long enough to read, then where to start.
  // The space request page comes first, so no earlier screen stays visible between the cards.
  await scene("p-cta", async at => {
    await page.goto(`${base}/inscription`); await settleDom(page)
    await page.getByRole("heading", { level: 1 }).first().waitFor()
    await at("Essayez benevol.app")
    await page.screencast.showChapter("Essayez benevol.app", { description: "Gratuit · Open source · Hébergé en France", duration: 4_500 })
    await at("Demandez votre espace sur benevol.app")
    await page.screencast.showChapter("Demandez votre espace", { description: "benevol.app", duration: 3_000 })
  })
}
