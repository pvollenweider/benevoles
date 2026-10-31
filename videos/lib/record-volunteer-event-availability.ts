// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of VOLUNTEER_EVENT_AVAILABILITY (#1146): the volunteer's side of the dated availability,
 * on the dedicated organisation of scripts/seed-video-volunteer-availability.ts (scenario
 * volunteer-event-availability). Not the habitual availability of « Mes inscriptions »
 * (VOLUNTEER_SESSION_AVAILABILITY).
 *
 * Before the screencast, `prepareVolunteerAvailability` asks Morgane through the organisers' real
 * route (what « Demander leurs disponibilités » sends, signed in as the owner by record.ts), waits for
 * the email the product delivers to the local Mailpit, reads its link (never printed) and signs out:
 * the volunteer has no session. The take then opens that email, follows « Indiquer mes
 * disponibilités » and fills the real page. Every take needs its own fresh seed: the take creates
 * the request and saves an answer.
 *
 * Labels are those of src/app/disponibilites/[token]/page.tsx, src/components/AvailabilityEditor.tsx,
 * src/lib/availability-editor.ts, src/lib/event-availability-text.ts and
 * src/lib/notifications/templates/availability.ts; videos/lib/__tests__/volunteer-availability-fixture.test.ts
 * checks VA_TYPED and VA_EXPECTED against them and against the seed.
 */
import assert from "node:assert/strict"
import type { Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Type = (page: Page, field: Locator, value: string) => Promise<void>
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; typeNaturally: Type; setup: VolunteerAvailabilitySetup }
export type VolunteerAvailabilitySetup = { mailId: string; linkPath: string }

/** Fixed ids of scripts/seed-video-volunteer-availability.ts (kept here: the recorder never imports a seed). */
const EVENT_ID = "video-event-availability-event"
const VOLUNTEER_ID = "video-event-availability-morgane"
const OWNER_EMAIL = "video.disponibilites.owner@example.org"
const VOLUNTEER_EMAIL = "video.disponibilites.morgane@example.org"
const MAILPIT = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"

export const VOLUNTEER_AVAILABILITY_OWNER_EMAIL = OWNER_EMAIL

/** What the take types and chooses, date by date from the Friday (the fixture test checks it). */
export const VA_TYPED = {
  firstName: "Morgane",
  /** Friday: two ranges, the second one ending the next morning. */
  friday: [{ start: "09:00", end: "12:00" }, { start: "20:00", end: "03:00" }],
  /** Saturday: « Reprendre les horaires du vendredi … ». Sunday: « Pas disponible ». */
} as const

/**
 * Words the screens must show for the narration to hold (checked by the fixture test and during the
 * take). Plain spaces: Playwright reads the screens' non-breaking spaces as spaces.
 */
export const VA_EXPECTED = {
  eventTitle: "Fête des Lanternes de Combe-Aurel",
  organizationName: "Association des Lanternes de Combe-Aurel",
  pageTitle: "Mes disponibilités pour Fête des Lanternes de Combe-Aurel",
  linkLabel: "Indiquer mes disponibilités",
  intro: "Pour chaque date, indique les heures où tu es libre, ou « Pas disponible ». Un horaire du soir peut finir le lendemain matin, par exemple de 20h à 3h. Pas besoin de compte. Seule l'organisation voit tes réponses.",
  notAnswered: "Tu n'as pas encore répondu.",
  answered: "Tu as répondu pour toutes les dates.",
  available: "Disponible à certaines heures",
  unavailable: "Pas disponible",
  addRange: "Ajouter un autre horaire",
  allUnavailableHeading: "Je ne peux pas venir du tout",
  allUnavailableButton: "Pas disponible pendant tout l'événement",
  save: "Enregistrer mes disponibilités",
  /** The deadline sentences start with these words; the date and time follow (fixture test: whole sentences). */
  deadlineLead: "Tu peux répondre ou changer tes réponses jusqu'au ",
  savedLead: "C'est enregistré. Tu peux fermer cette page ; tu pourras changer tes réponses avec ce même lien jusqu'au ",
  emailDeadlineLead: "Merci de répondre avant le ",
} as const

/**
 * Off screen, before the screencast: asks Morgane through the organisers' real route, waits for the
 * delivered email, reads its link path and signs the owner out. Fails when the fixture was used.
 */
export async function prepareVolunteerAvailability(page: Page, base: string): Promise<VolunteerAvailabilitySetup> {
  await page.goto(`${base}/admin/events/${EVENT_ID}/availability`)
  await page.getByRole("heading", { level: 1, name: "Disponibilités", exact: true }).waitFor()
  // Same-origin call from the organisers' page, as « Demander leurs disponibilités » makes it.
  const sent = await page.evaluate(async ({ eventId, volunteerId }) => {
    const response = await fetch(`/api/admin/events/${eventId}/availability`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volunteerIds: [volunteerId] }) })
    return { status: response.status, body: await response.json().catch(() => null) as { asked?: number; emailsQueued?: number } | null }
  }, { eventId: EVENT_ID, volunteerId: VOLUNTEER_ID })
  assert.equal(sent.status, 200, "The availability request was refused: run the volunteer-event-availability seed")
  assert.equal(sent.body?.emailsQueued, 1, "Morgane was already asked: run the volunteer-event-availability seed")

  let mail: { ID: string; Subject: string } | undefined
  for (let attempt = 0; attempt < 80 && !mail; attempt++) {
    const response = await page.request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${VOLUNTEER_EMAIL}`, limit: 50 } })
    if (response.ok()) {
      const result = await response.json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[]; messages_count: number }
      assert(result.messages_count <= 1, "Mailpit holds an earlier email to Morgane: clear the fixture's messages first")
      mail = result.messages.find(m => m.Subject === `[${VA_EXPECTED.organizationName}] Tes disponibilités pour ${VA_EXPECTED.eventTitle}` && m.To.some(t => t.Address === VOLUNTEER_EMAIL))
    }
    if (!mail) await page.waitForTimeout(250)
  }
  assert(mail, "The availability request email never reached the local Mailpit")
  const detail = await (await page.request.get(`${MAILPIT}/api/v1/message/${mail.ID}`)).json() as { Text: string }
  const link = /https?:\/\/\S+?(\/disponibilites\/[A-Za-z0-9_-]+)/.exec(detail.Text)
  assert(link, "The availability request email has no personal link")
  // The volunteer has no session: the owner signs out before the take.
  await page.context().clearCookies()
  return { mailId: mail.ID, linkPath: link[1] }
}

export async function recordVolunteerEventAvailability(options: Options) {
  const { page, base, title, scene, tap, settle, typeNaturally, setup } = options
  const exact = { exact: true } as const
  /** The fieldset of the n-th date of the event (0: the Friday). */
  const day = (n: number) => page.locator("fieldset[data-availability-day]").nth(n)
  const timeField = (n: number, range: number, field: "Début" | "Fin") => day(n).locator("[data-availability-range]").nth(range).getByLabel(new RegExp(`^${field}`))
  /** Types an hour the way a person does in the time field: its hours, then its minutes. */
  const typeTime = async (field: Locator, value: string) => {
    await typeNaturally(page, field, value.replace(":", ""))
    if (await field.inputValue() !== value) {
      // The click may land on the minutes: start again from the hours.
      await field.fill("")
      await field.focus()
      await field.pressSequentially(value.replace(":", ""), { delay: 95 })
    }
    assert.equal(await field.inputValue(), value, `the time field shows ${value}`)
  }

  // The take's own email, alone in the list of Morgane's messages.
  await page.goto(`${MAILPIT}/search?q=${encodeURIComponent(`to:${VOLUNTEER_EMAIL}`)}`); await settle(page)
  const listed = page.locator(`a[href="/view/${setup.mailId}"]`).first()
  await listed.waitFor()

  await scene("va-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Tes heures libres, date par date, avec le lien reçu par email", duration: 2_400 })
  })

  await scene("va-email", async at => {
    await tap(page, listed)
    const body = page.frameLocator("iframe").first()
    await body.getByText(`Bonjour ${VA_TYPED.firstName},`, exact).waitFor()
    await at("Il donne la date limite pour répondre")
    await body.getByText(VA_EXPECTED.emailDeadlineLead, { exact: false }).waitFor()
    await at("Elle appuie sur Indiquer mes disponibilités")
    const button = body.getByRole("link", { name: VA_EXPECTED.linkLabel, exact: true })
    // Mailpit opens a message's links in a new tab: the take follows the same link in this one.
    const popup = page.context().waitForEvent("page", { timeout: 2_500 }).catch(() => null)
    await tap(page, button)
    await (await popup)?.close()
    await page.goto(`${base}${setup.linkPath}`); await settle(page)
    await page.getByRole("heading", { level: 1, name: VA_EXPECTED.pageTitle, exact: true }).waitFor()
  })

  await scene("va-page", async at => {
    await page.getByText(VA_EXPECTED.intro, exact).waitFor()
    await at("Juste en dessous, la date limite")
    await page.getByText(VA_EXPECTED.deadlineLead, { exact: false }).first().waitFor()
    await at("Pour l'instant, Morgane n'a pas encore répondu")
    const state = page.getByText(VA_EXPECTED.notAnswered, exact)
    await state.scrollIntoViewIfNeeded()
    assert.equal(await page.locator("[data-availability-no-answer]").count(), 3, "three dates without an answer")
  })

  await scene("va-hours", async at => {
    await day(0).scrollIntoViewIfNeeded()
    await at("Le vendredi")
    await tap(page, day(0).getByRole("radio", { name: VA_EXPECTED.available, exact: true }))
    await at("Elle indique le début, neuf heures, et la fin, midi")
    await typeTime(timeField(0, 0, "Début"), VA_TYPED.friday[0].start)
    await typeTime(timeField(0, 0, "Fin"), VA_TYPED.friday[0].end)
  })

  await scene("va-night", async at => {
    await at("Ajouter un autre horaire")
    await tap(page, day(0).getByRole("button", { name: new RegExp(`^${VA_EXPECTED.addRange}`) }))
    await day(0).getByText("Horaire 2", exact).waitFor()
    await typeTime(timeField(0, 1, "Début"), VA_TYPED.friday[1].start)
    await typeTime(timeField(0, 1, "Fin"), VA_TYPED.friday[1].end)
    await at("Un horaire du soir peut finir le lendemain matin")
    const hint = day(0).getByText(/^Fin\W+se termine le lendemain, samedi /)
    await hint.waitFor()
    await hint.evaluate(element => element.scrollIntoView({ block: "center" }))
  })

  await scene("va-copy", async at => {
    const copy = day(1).getByRole("button", { name: /^Reprendre les horaires du vendredi / })
    await copy.scrollIntoViewIfNeeded()
    await at("Le samedi")
    await tap(page, copy)
    assert.equal(await day(1).locator("[data-availability-range]").count(), 2, "Saturday takes Friday's two ranges")
    assert.equal(await timeField(1, 1, "Fin").inputValue(), VA_TYPED.friday[1].end)
    await day(1).getByText(/^Fin\W+se termine le lendemain, dimanche /).scrollIntoViewIfNeeded()
  })

  await scene("va-unavailable", async at => {
    await day(2).scrollIntoViewIfNeeded()
    await at("Le dimanche, elle ne peut pas venir")
    await tap(page, day(2).getByRole("radio", { name: VA_EXPECTED.unavailable, exact: true }))
    assert.equal(await page.locator("[data-availability-no-answer]").count(), 0, "every date has a choice")
    await at("Si tu ne peux pas venir du tout")
    await page.getByRole("heading", { name: VA_EXPECTED.allUnavailableHeading, exact: true }).scrollIntoViewIfNeeded()
    await page.getByRole("button", { name: VA_EXPECTED.allUnavailableButton, exact: true }).waitFor()
  })

  await scene("va-save", async at => {
    const save = page.getByRole("button", { name: VA_EXPECTED.save, exact: true })
    await save.scrollIntoViewIfNeeded()
    await page.getByText("Changements non enregistrés", exact).waitFor()
    await tap(page, save)
    await at("La page confirme que c'est enregistré")
    const saved = page.getByRole("status").filter({ hasText: VA_EXPECTED.savedLead })
    await saved.waitFor()
    await saved.evaluate(element => element.scrollIntoView({ block: "center" }))
    assert.equal(await page.getByText("Changements non enregistrés", exact).count(), 0, "nothing left unsaved")
  })

  await scene("va-change", async at => {
    await at("Rouvrons le même lien")
    await page.reload(); await settle(page)
    await page.getByRole("heading", { level: 1, name: VA_EXPECTED.pageTitle, exact: true }).waitFor()
    await page.getByText(VA_EXPECTED.answered, exact).scrollIntoViewIfNeeded()
    // What was saved comes back in the form: Friday's two ranges, Sunday « Pas disponible ».
    assert.equal(await timeField(0, 0, "Début").inputValue(), VA_TYPED.friday[0].start)
    assert.equal(await timeField(0, 1, "Fin").inputValue(), VA_TYPED.friday[1].end)
    assert.equal(await day(2).getByRole("radio", { name: VA_EXPECTED.unavailable, exact: true }).isChecked(), true)
    await at("et elle peut encore les modifier jusqu'à la date limite")
    await day(0).scrollIntoViewIfNeeded()
  })
}
