// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of EVENT_SIGNUP_PAGE_SETTINGS: the four settings that change what volunteers see on the
 * sign-up page, each followed by its effect on the real public page, on the dedicated organisation
 * of scripts/seed-video-signup-settings.ts (scenario signup-page-settings). Every setting is changed
 * through the real screens, signed in as the owner (record.ts logs in before the screencast); the
 * public page is reloaded after each change and its effect asserted. Every take needs its own fresh
 * seed: the take changes the four settings.
 *
 * Labels are those of src/components/admin/EventForm.tsx (« Affichage des créneaux par défaut »,
 * « Créneaux qui se chevauchent », the « Autoriser les créneaux qui se chevauchent ? » dialog),
 * OrgCharterForm.tsx (« Demander aux bénévoles d'accepter une convention »), EventSectorsOption.tsx
 * and src/lib/sectors.ts (PUBLIC_GROUPING_LABEL), ShiftDayList.tsx (sector headings, « Détails »),
 * DayTimeline.tsx (sector groups) and src/lib/signup-recap.ts (ALLOWED_OVERLAP_ADVICE).
 */
import assert from "node:assert/strict"
import type { Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Type = (page: Page, field: Locator, value: string) => Promise<void>
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; typeNaturally: Type }

/** Fixed ids of scripts/seed-video-signup-settings.ts (kept here: the recorder never imports a seed). */
const EVENT_ID = "video-signup-event"
const EVENT_SLUG = "fete-des-vendanges"
const EVENT_TITLE = "Fête des vendanges de Montvert"
const ORG_SLUG = "formation-inscription"
const OWNER_EMAIL = "video.signup.owner@example.org"
const shiftId = (key: string) => `video-signup-shift-${key}`

export const SIGNUP_SETTINGS_OWNER_EMAIL = OWNER_EMAIL

const PUBLIC_GROUPING_LABEL = "Regrouper les créneaux par secteur sur la page d'inscription"
const ALLOWED_OVERLAP_ADVICE = "Tu peux quand même t'inscrire. Vérifie que tu peux faire les deux. Si quelqu'un te remplace, dis-le à l'organisation."

/** The public page keeps requests open (roster, maps): DOM, fonts, then its title. */
async function settleDom(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" })
  await page.evaluate(() => document.fonts?.ready)
  await page.waitForTimeout(500)
}

export async function recordSignupPageSettings(options: Options) {
  const { page, base, title, scene, tap, settle } = options
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const edit = `/admin/events/${EVENT_ID}/edit`
  const publicPage = async () => {
    await page.goto(`https://${ORG_SLUG}.benevol.app/${EVENT_SLUG}`); await settleDom(page)
    await page.getByRole("heading", { level: 1, name: EVENT_TITLE }).waitFor()
  }
  const saved = () => page.getByText(/^Modifications enregistrées à/).first().waitFor()
  const shift = (key: string) => page.locator(`[data-shift-id="${shiftId(key)}"]`).filter({ visible: true }).first()
  const viewButton = (name: "Frise" | "Liste") => page.getByRole("group", { name: "Affichage des créneaux" }).getByRole("button", { name, exact: true })

  await go(edit)
  const viewGroup = page.getByRole("group", { name: "Affichage des créneaux par défaut" })
  assert(await viewGroup.getByRole("radio", { name: "Automatique", exact: true }).isChecked(), "Sign-up settings fixture already used: run the signup-page-settings seed")

  await scene("settings-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Quatre réglages, et leur effet sur la page d'inscription", duration: 2_400 })
  })

  // 1. Default view of the shifts.
  await scene("settings-view", async at => {
    await at("Affichage des créneaux par défaut")
    await viewGroup.scrollIntoViewIfNeeded()
    await at("Choisissons Liste")
    await tap(page, viewGroup.getByRole("radio", { name: "Liste", exact: true }))
    await saved()
    await at("Sur la page d'inscription")
    await publicPage()
    assert.equal(await viewButton("Liste").getAttribute("aria-pressed"), "true", "The event's default view is the list")
    await page.getByRole("list", { name: /^Créneaux du / }).first().waitFor()
    await at("le visiteur garde la main")
    await viewButton("Frise").scrollIntoViewIfNeeded()
  })

  // 2. Overlapping shifts.
  await scene("settings-overlaps", async at => {
    await at("Choisissons le Bar de 18 h")
    await tap(page, shift("bar-evening"))
    await at("le Vestiaire aux mêmes heures ne peut plus être choisi")
    assert.equal(await shift("vestiaire").getAttribute("aria-disabled"), "true", "Without the option, the overlapping shift is refused")
    await shift("vestiaire").scrollIntoViewIfNeeded()
    await at("Revenons au formulaire de l'événement")
    await go(edit)
    const overlaps = page.locator("#event-overlaps")
    await overlaps.scrollIntoViewIfNeeded()
    await at("Autoriser les chevauchements")
    await tap(page, overlaps.getByRole("button", { name: "Autoriser les chevauchements…", exact: true }))
    const dialog = page.getByRole("dialog", { name: "Autoriser les créneaux qui se chevauchent ?" })
    await dialog.waitFor()
    await at("Confirmons")
    await tap(page, dialog.getByRole("button", { name: "Autoriser", exact: true }))
    await overlaps.getByText("Chevauchements : autorisés").waitFor()
    await saved()
    await at("les deux créneaux se choisissent ensemble")
    await publicPage()
    if (await shift("bar-evening").getAttribute("aria-pressed") !== "true") await tap(page, shift("bar-evening"))
    await tap(page, shift("vestiaire"))
    assert.equal(await shift("vestiaire").getAttribute("aria-pressed"), "true", "With the option, the overlapping shift can be chosen")
    await at("Le récapitulatif")
    await tap(page, page.getByRole("button", { name: /^Continuer/ }).filter({ visible: true }).first())
    await page.getByRole("heading", { name: "Tes informations" }).waitFor()
    const advice = page.getByText(ALLOWED_OVERLAP_ADVICE).filter({ visible: true }).first()
    await advice.scrollIntoViewIfNeeded()
  })

  // 3. The volunteer convention (organisation Paramètres, owner).
  await scene("settings-convention", async at => {
    await at("dans les Paramètres de l'organisation")
    await go("/admin/settings/admins")
    const heading = page.getByRole("heading", { level: 2, name: "Convention des bénévoles", exact: true })
    const card = heading.locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]")
    await heading.scrollIntoViewIfNeeded()
    const toggle = card.getByRole("switch", { name: "Demander aux bénévoles d'accepter une convention", exact: true })
    assert.equal(await toggle.getAttribute("aria-checked"), "true", "The convention starts asked")
    await at("Désactivons Demander aux bénévoles")
    await tap(page, toggle)
    await card.getByText("Aucune convention n'est demandée à l'inscription.").waitFor()
    await at("Puis enregistrons")
    await tap(page, card.getByRole("button", { name: "Enregistrer", exact: true }))
    await card.getByRole("status").getByText("Enregistré").waitFor()
    await at("Le formulaire d'inscription")
    await publicPage()
    if (await shift("accueil-am").getAttribute("aria-pressed") !== "true") await tap(page, shift("accueil-am"))
    await tap(page, page.getByRole("button", { name: /^Continuer/ }).filter({ visible: true }).first())
    await page.getByRole("heading", { name: "Tes informations" }).waitFor()
    assert.equal(await page.getByRole("button", { name: "convention des bénévoles" }).count(), 0, "No convention link without a convention")
    assert.equal(await page.locator("label").filter({ hasText: "J'ai lu et j'accepte" }).count(), 0, "No convention box without a convention")
    await page.getByRole("button", { name: "Confirmer mon inscription" }).scrollIntoViewIfNeeded()
  })

  // 4. Shifts grouped by sector on the sign-up page.
  await scene("settings-sectors", async at => {
    await at("la carte Secteurs")
    await go(edit)
    const card = page.locator('[data-event-sectors="1"]')
    await card.scrollIntoViewIfNeeded()
    const grouping = card.getByRole("switch", { name: PUBLIC_GROUPING_LABEL, exact: true })
    assert.equal(await grouping.getAttribute("aria-checked"), "false", "The grouping starts off")
    await at("Activons-le")
    await tap(page, grouping)
    await card.getByText("Regroupement activé : la page d'inscription montre vos secteurs.").waitFor()
    await at("En liste")
    await publicPage()
    if (await viewButton("Liste").getAttribute("aria-pressed") !== "true") await tap(page, viewButton("Liste"))
    const headings = page.getByRole("heading", { level: 3 }).filter({ visible: true })
    await headings.first().waitFor()
    assert.deepEqual(await headings.allTextContents(), ["Accueil", "Buvette", "Autres postes"], "Sector headings in the sectors' order, « Autres postes » last")
    await page.getByRole("list", { name: /^Créneaux Buvette, / }).scrollIntoViewIfNeeded()
    await at("En frise")
    await tap(page, viewButton("Frise"))
    const groups = page.getByRole("group", { name: "Accueil", exact: true }).filter({ visible: true })
    await groups.first().waitFor()
    await page.getByRole("group", { name: "Autres postes", exact: true }).filter({ visible: true }).first().scrollIntoViewIfNeeded()
  })

  // 5. « Détails » in the list.
  await scene("settings-details", async at => {
    await at("Revenons à la liste")
    await tap(page, viewButton("Liste"))
    const details = page.getByRole("button", { name: /^Détails : .*Accueil entrée/ }).filter({ visible: true }).first()
    await details.scrollIntoViewIfNeeded()
    const before = await shift("accueil-am").getAttribute("aria-pressed")
    await at("Détails")
    await tap(page, details)
    assert.equal(await details.getAttribute("aria-expanded"), "true", "« Détails » opens the shift's information")
    await page.getByText("Grand portail, place du Pressoir").filter({ visible: true }).first().waitFor()
    assert.equal(await shift("accueil-am").getAttribute("aria-pressed"), before, "Reading the details neither chooses nor drops the shift")
  })

  await scene("settings-recap", async () => {
    await page.getByRole("heading", { level: 1, name: EVENT_TITLE }).scrollIntoViewIfNeeded()
  })
}
