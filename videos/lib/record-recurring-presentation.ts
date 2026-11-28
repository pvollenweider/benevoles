// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of RECURRING_PRESENTATION, « Des bénévoles chaque semaine, sans refaire le planning »:
 * a repair café that opens a Saturday every other week, on the dedicated organisation of
 * scripts/seed-video-repair-cafe.ts (scenario repair-cafe-presentation). Every screen is a real
 * one: the season created from the « Repair café » template and published, Sarah's real sign-up
 * for three Saturdays on the public page, her « Mes inscriptions » page opened from her real
 * confirmation email, then « Où manque-t-il du monde ? » and the hours export. record.ts signs in
 * as the organiser before the screencast. Every take needs a fresh seed.
 *
 * Labels are those of src/components/admin/EventTemplatePicker.tsx, PublishToggle.tsx,
 * MembersManager.tsx, the public page's « Choisir le mois » group (src/app/[eventSlug]/
 * EventPageClient.tsx) and the public sign-up journey filmed by VOLUNTEER_REGISTER.
 */
import type { Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"
import { surnameOf } from "./fixture-names"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Fill = (page: Page, field: Locator, value: string, pauseMs?: number) => Promise<void>
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; fill: Fill }

/** Fixed values of scripts/seed-video-repair-cafe.ts (kept here: the recorder never imports a seed). */
const ORG_SLUG = "repair-cafe-montvert"
const OWNER_EMAIL = "video.repair.owner@example.org"
const SEASON_TITLE = "Repair Café de Montvert"
const VOLUNTEER = { firstName: "Sarah", email: "video.repair.sarah@example.org" }
const MAILPIT = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"

export const REPAIR_OWNER_EMAIL = OWNER_EMAIL

/** The first Saturday at least two days ahead, in the organisation's time zone, as YYYY-MM-DD. */
export function seasonStart(now: Date): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 2)
  date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7))
  return date.toISOString().slice(0, 10)
}

/** Public pages keep requests open: DOM, fonts, then a visible landmark. */
async function settleDom(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

/** The « Mes inscriptions » link of Sarah's newest email, from the real local mailbox. */
async function myRegistrationsLink(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await page.request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${VOLUNTEER.email}`, limit: 10 } })
    if (search.ok()) {
      const found = (await search.json() as { messages: { ID: string }[] }).messages[0]
      if (found) {
        const message = await page.request.get(`${MAILPIT}/api/v1/message/${encodeURIComponent(found.ID)}`)
        const html = (await message.json() as { HTML?: string }).HTML ?? ""
        const href = html.match(/https?:\/\/[^"'\s<>]+\/mes-inscriptions\/[A-Za-z0-9_-]+/)?.[0]
        if (href) return href
      }
    }
    await page.waitForTimeout(250)
  }
  throw new Error("No « Mes inscriptions » link in Sarah's email")
}

export async function recordRecurringPresentation(options: Options) {
  const { page, base, title, scene, tap, settle, fill } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const heading = (name: string) => page.getByRole("heading", { level: 1, name, exact: true })
  const card = (id: string, cardTitle: string, description: string) => scene(id, async () => {
    await page.screencast.showChapter(cardTitle, { description, duration: 600 })
  })
  let eventPath = ""
  let publicUrl = ""

  await go("/admin/events")
  await scene("r-hook", async () => {
    await page.screencast.showChapter(title, { description: "Un samedi sur deux, toute l'année", duration: 2_800 })
  })
  await scene("r-story", async () => {
    await page.getByRole("heading", { level: 1 }).first().waitFor()
  })

  // The season, created once from the template, then published.
  await card("r-season-hook", "Une fois pour toute la saison", "Le modèle Repair café")
  await scene("r-season", async at => {
    await at("Il part du modèle Repair café")
    await go("/admin/events/new")
    await tap(page, page.getByRole("radio", { name: /^Repair café/ }))
    const details = page.getByRole("region", { name: "Repair café" })
    await details.waitFor()
    const titleField = details.getByLabel("Titre", { exact: true })
    await titleField.fill("")
    await fill(page, titleField, SEASON_TITLE, 80)
    await details.getByLabel(/^Premier jour/).fill(seasonStart(new Date()))
    await details.getByRole("heading", { level: 3, name: "Ce qui sera créé" }).scrollIntoViewIfNeeded()
    await at("La saison se crée d'un coup")
    await tap(page, details.getByRole("button", { name: /^Créer le brouillon/ }))
    await page.waitForURL(url => /^\/admin\/events\/[^/]+(\/shifts)?\/?$/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 30_000 })
    eventPath = new URL(page.url()).pathname.replace(/\/shifts\/?$/, "").replace(/\/$/, "")
    await go(`${eventPath}/review`)
    await tap(page, page.getByRole("button", { name: /^Publier/ }).first())
    await page.getByText("Publié", { exact: true }).first().waitFor()
    await go(`${eventPath}/edit`)
    const registrations = page.getByRole("checkbox", { name: "Inscriptions ouvertes" })
    if (!(await registrations.isChecked())) await tap(page, registrations)
    await page.waitForTimeout(250)
    const slug = await page.evaluate(async (path) => (await (await fetch(`/api${path}`)).json()).slug as string, eventPath)
    publicUrl = `https://${ORG_SLUG}.benevol.app/${slug}`
  })

  // Sarah signs up for three Saturdays, in one go.
  await card("r-volunteers-hook", "Et les bénévoles ?", "Un lien, un bouton par mois")
  await scene("r-signup", async at => {
    await at("Ils ouvrent le lien")
    await page.goto(publicUrl); await settleDom(page)
    await page.getByRole("group", { name: "Choisir le mois" }).waitFor()
    await at("Sarah prend trois samedis d'un coup")
    const repair = () => page.getByRole("button", { name: /· Réparation/ }).filter({ visible: true })
    for (const index of [0, 1]) { await repair().nth(index).scrollIntoViewIfNeeded(); await tap(page, repair().nth(index)) }
    const months = page.getByRole("group", { name: "Choisir le mois" }).getByRole("button")
    await tap(page, months.nth(1))
    await repair().first().scrollIntoViewIfNeeded(); await tap(page, repair().first())
    await tap(page, page.getByRole("button", { name: /^Continuer/ }).filter({ visible: true }).first())
    await page.getByRole("heading", { name: "Tes informations" }).waitFor()
    // The form is not narrated: filled at once, without touch markers, so the scene keeps to its sentences.
    await page.getByRole("textbox", { name: "Prénom", exact: true }).fill(VOLUNTEER.firstName)
    await page.getByRole("textbox", { name: "Nom", exact: true }).fill(surnameOf(VOLUNTEER.firstName))
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(VOLUNTEER.email)
    const charter = page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).getByRole("checkbox")
    if (await charter.count()) await charter.check()
    await page.getByRole("checkbox", { name: /^J'accepte que l'association qui organise cet événement/ }).check()
    await page.getByRole("button", { name: "Confirmer mon inscription" }).scrollIntoViewIfNeeded()
  })

  // Her page, from her real email: every date, the calendar subscription. The sign-up is confirmed
  // as the scene opens, then her page comes from the link of her real confirmation email.
  await scene("r-mypage", async at => {
    await tap(page, page.getByRole("button", { name: "Confirmer mon inscription" }))
    await page.waitForURL(/\/success/, { timeout: 20_000 })
    await at("Sur sa page Mes inscriptions")
    await page.goto(await myRegistrationsLink(page)); await settleDom(page)
    await heading("Toutes mes inscriptions").waitFor()
    await at("Un rappel part avant chaque permanence")
    await page.getByRole("heading", { name: "Mon calendrier" }).first().scrollIntoViewIfNeeded()
  })

  // At the end of the year: the Saturdays short of people, the hours for the annual report.
  await card("r-year-hook", "Et en fin d'année ?", "Le suivi et le rapport annuel")
  await scene("r-year", async at => {
    await at("Nicolas voit tout de suite les samedis qui manquent de monde")
    await go(`${eventPath}/staffing`)
    await heading("Où manque-t-il du monde ?").waitFor()
    await at("Et il exporte les heures de chacun")
    await go("/admin/members")
    const hours = page.getByText("Heures par bénévole, pour une période (CSV)", { exact: true })
    await hours.scrollIntoViewIfNeeded()
    await tap(page, hours)
  })

  // The call to action.
  await scene("r-cta", async at => {
    await page.screencast.showChapter("Décrivez votre permanence une fois", { description: "Repair café · Épicerie · Café associatif", duration: 3_000 })
    await at("demandez votre espace sur benevol.app")
    await page.goto(`${base}/inscription`); await settleDom(page)
    await page.getByRole("heading", { level: 1 }).first().waitFor()
    await page.screencast.showChapter("Essayez benevol.app", { description: "Gratuit · Open source · Hébergé en France", duration: 2_000 })
  })
}
