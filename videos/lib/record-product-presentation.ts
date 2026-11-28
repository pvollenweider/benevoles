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

  // 1. The story starts: the fête, its postes, the spreadsheet of the past years.
  await go(event)
  await scene("pres-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Une fête de village, de la préparation au bilan", duration: 2_600 })
    await heading(EVENT_TITLE).waitFor()
  })

  // 2. Preparing: last year's fête taken up again, then the day on the frise.
  await scene("pres-prepare", async at => {
    await at("elle reprend la fête de l'an dernier")
    await go(`${event}/duplicate`)
    await heading("Dupliquer l'événement").waitFor()
    await at("Sur la frise")
    await go(`${event}/shifts`)
    await page.getByRole("button", { name: /Buvette/ }).filter({ visible: true }).first().scrollIntoViewIfNeeded()
  })

  // 3. Léa signs up through the shared link, for real.
  await scene("pres-signup", async at => {
    await at("Léa l'ouvre depuis chez elle")
    await page.goto(publicUrl); await settleDom(page)
    await heading(EVENT_TITLE).waitFor()
    await at("Elle choisit l'accueil du matin")
    const morning = page.getByRole("button", { name: /^09h–12h.*Accueil.*sélectionner/ }).filter({ visible: true }).first()
    await morning.scrollIntoViewIfNeeded()
    await tap(page, morning)
    await tap(page, page.getByRole("button", { name: /^Continuer/ }).filter({ visible: true }).first())
    await page.getByRole("heading", { name: "Tes informations" }).waitFor()
    await at("Son nom, son email, son téléphone")
    await fill(page, page.getByRole("textbox", { name: "Prénom", exact: true }), VOLUNTEER.firstName, 120)
    await fill(page, page.getByRole("textbox", { name: "Nom", exact: true }), fullNameOf(VOLUNTEER.firstName).split(" ").slice(1).join(" "), 120)
    await fill(page, page.getByRole("textbox", { name: "Email", exact: true }), VOLUNTEER.email, 120)
    await fill(page, page.getByRole("textbox", { name: /Téléphone/, exact: true }), VOLUNTEER.phone, 120)
    const size = page.getByRole("radio", { name: "M", exact: true })
    if (await size.count()) { await size.scrollIntoViewIfNeeded(); await tap(page, size) }
    const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
    if (await charter.count()) await tap(page, charter)
    await tap(page, page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }))
    const submit = page.getByRole("button", { name: "Confirmer mon inscription" })
    await submit.scrollIntoViewIfNeeded()
    await tap(page, submit)
    await page.waitForURL(/\/success/, { timeout: 20_000 }); await settleDom(page)
    await at("Pas de compte à créer")
    await page.getByRole("heading", { level: 1 }).first().scrollIntoViewIfNeeded()
  })

  // 4. Following: where people are missing, then a message from a template.
  await scene("pres-follow", async at => {
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

  // 5. The day before: the documents to print.
  await scene("pres-print", async at => {
    await at("La veille")
    await go(`${event}/print`)
    await heading("Documents à imprimer").waitFor()
    await at("Le jour J")
    await page.getByRole("heading", { level: 2, name: "Badges", exact: true }).scrollIntoViewIfNeeded()
  })

  // 6. After the fête: the review.
  await scene("pres-after", async at => {
    await at("le bilan")
    await page.getByRole("heading", { level: 2, name: "Résumé de l'événement", exact: true }).scrollIntoViewIfNeeded()
  })

  // 7. Trust, and where to start.
  await scene("pres-closing", async at => {
    await page.screencast.showChapter("Gratuit et open source", { description: "Développé en Suisse, hébergé en France, sans cookie de pistage", duration: 3_400 })
    await at("Demandez votre espace sur benevol.app")
    await page.goto(`${base}/inscription`); await settleDom(page)
    await page.getByRole("heading", { level: 1 }).first().waitFor()
  })
}
