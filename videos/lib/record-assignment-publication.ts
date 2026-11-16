// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Capture of ASSIGNMENT_PUBLICATION (#1172): what follows ASSIGNMENT_PROPOSALS. On the dedicated
 * organisation of scripts/seed-video-publication.ts (scenario assignment-publication), the owner
 * publishes the 29 drafts for real, reads « Publication faite » and the registrations; then the
 * emails the product delivers to the local Mailpit (Emma's, then Noah's), what Noah sees from
 * « Gérer mes inscriptions » and his cancellation, the owner's « Désistement » email, Emma's
 * correction of her availability from her availability link, and the mission « à revoir » it
 * leaves on the owner's « Affectations en brouillon ».
 *
 * Before the screencast, `preparePublication` (signed in as the owner by record.ts) asks Emma for her
 * availability through the organisers' real route, so that her link reaches Mailpit as a real email
 * (her answer, seeded, stays as it is), and keeps the owner's session for the organiser's scenes.
 * The emails that wait in the outbox (the placements ten minutes, the withdrawal five) are made due
 * off screen and delivered by the real outbox cron: no email is ever written by the recorder. The
 * volunteers' scenes run without any session, as the volunteers have none. Every take needs its
 * own fresh seed: it publishes, cancels a registration and saves an answer.
 *
 * Labels are those of src/components/admin/DraftBoard.tsx, src/app/my/[token]/page.tsx,
 * src/lib/volunteer-withdraw.ts, src/app/disponibilites/[token]/page.tsx,
 * src/lib/event-availability-text.ts and the templates of src/lib/notifications/templates;
 * videos/lib/__tests__/publication-fixture.test.ts checks PB_TYPED and PB_EXPECTED against them.
 */
import assert from "node:assert/strict"
import type { BrowserContext, Locator, Page } from "playwright"
import type { Cue } from "./sentence-timing"
import { fullNameOf } from "./fixture-names"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>
type Tap = (page: Page, target: Locator) => Promise<void>
type Type = (page: Page, field: Locator, value: string) => Promise<void>
type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>
export type PublicationSetup = { ownerCookies: Cookies; availabilityMailId: string; availabilityLink: string }
type Options = { page: Page; base: string; title: string; scene: Scene; tap: Tap; settle: (page: Page) => Promise<void>; typeNaturally: Type; setup: PublicationSetup }

/** Fixed ids of scripts/seed-video-publication.ts (kept here: the recorder never imports a seed). */
const ORG_ID = "video-publication"
const EVENT_ID = "video-publication-event"
const OWNER_EMAIL = "video.publication.owner@example.org"
const person = (key: string) => `video-publication-person-${key}`
const email = (key: string) => `video.publication.${key}@example.org`
const MAILPIT = process.env.VIDEO_MAILPIT_URL ?? "http://localhost:48026"
/** The app itself, for the outbox cron (the screens may go through the public host proxy). */
const LOCAL_APP = (process.env.VIDEO_BASE_URL ?? "http://localhost:43100").replace(/\/$/, "")

export const PUBLICATION_OWNER_EMAIL = OWNER_EMAIL

/** Who the take follows and what it types (the fixture test checks them against the seed). */
export const PB_TYPED = {
  /** The first email shown, then the correction of her availability. */
  emma: { key: "emma", firstName: "Emma", shifts: ["bar-fri", "bar-sat"], corrected: "bar-fri", day: 0 },
  /** The second email, then his page and the cancellation of Sunday's car park. */
  noah: { key: "noah", firstName: "Noah", shifts: ["acc-sat-am", "par-sun"], cancelled: "par-sun", kept: "acc-sat-am" },
  /** Typed in « Un mot pour l'organisation ? (facultatif) ». */
  message: "Absent dimanche matin, désolé.",
} as const

/** Words the screens must show for the narration to hold (checked by the fixture test and during the take). */
export const PB_EXPECTED = {
  drafts: "29 affectations en brouillon pour 11 personnes.",
  confirm: /^29 affectations pour 11 personnes\W+chaque personne avec une adresse email reçoit un seul email avec ses missions\.$/,
  confirmTakes: /^Les places sont prises maintenant\W+tout est publié d'un coup, ou rien si un point bloque\.$/,
  published: "29 affectations publiées pour 11 personnes. Chaque personne avec une adresse email reçoit un seul email avec ses missions.",
  noDraft: "Aucune affectation en brouillon pour l'instant.",
  confirmed: "Confirmée",
  registrations: "29 inscriptions actives",
  source: "Affectation publiée",
  emailSubject: "Tu es inscrit·e : Rencontres du Val d'Orsel",
  /** The organiser who published signs the email: the seed's owner, Colette. */
  emailLead: (firstName: string, count: number) => `${fullNameOf("Colette")}, de Association des Rencontres du Val d'Orsel, t'a inscrit·e à Rencontres du Val d'Orsel, sur ${count} créneaux :`,
  emailButton: "Gérer mes inscriptions",
  emailUnwanted: "Un créneau ne te convient pas ? Annule-le depuis ton lien personnel, ou réponds à cet email.",
  myTitle: "Mes inscriptions",
  myShifts: "Tous mes créneaux",
  writeToOrganisation: "Écrire à l'organisation",
  cancel: "Annuler",
  cancelTitle: "Confirmer l'annulation ?",
  cancelMessage: "Un mot pour l'organisation ? (facultatif)",
  cancelConfirm: "Oui, annuler",
  withdrawalSubject: "Désistement — Rencontres du Val d'Orsel",
  placeMissing: "Il manque maintenant 1 place sur ce créneau.",
  replacement: "Trouver un remplaçant",
  availabilitySubject: "[Association des Rencontres du Val d'Orsel] Tes disponibilités pour Rencontres du Val d'Orsel",
  availabilityButton: "Indiquer mes disponibilités",
  availabilityTitle: "Mes disponibilités pour Rencontres du Val d'Orsel",
  correction: "Tu peux corriger tes disponibilités. Cela ne modifie ni n'annule tes missions. Préviens aussi l'organisation en cas de difficulté.",
  unavailable: "Pas disponible",
  save: "Enregistrer mes disponibilités",
  saved: "C'est enregistré. Si tes disponibilités ont changé, l'organisation est prévenue ; tes missions restent les mêmes. Tu peux fermer cette page.",
  toReview: "1 mission à revoir après une correction des disponibilités",
  toReviewNote: "Ces missions sont actuellement en dehors des disponibilités corrigées. Personne n'a été déplacé ni désinscrit.",
  cellReview: "À revoir : actuellement en dehors de ses disponibilités corrigées.",
  seeRegistration: "Voir l'inscription",
} as const

type Mail = { ID: string; Subject: string; To: { Address: string }[] }

async function mailsTo(page: Page, address: string): Promise<Mail[]> {
  const response = await page.request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:${address}`, limit: 50 } })
  if (!response.ok()) return []
  return ((await response.json()) as { messages: Mail[] }).messages.filter((m) => m.To.some((t) => t.Address === address))
}

/** Waits for the one email of that subject the product delivered to that address during this take. */
async function deliveredMail(page: Page, address: string, subject: string): Promise<Mail> {
  for (let attempt = 0; attempt < 80; attempt++) {
    const found = (await mailsTo(page, address)).filter((m) => m.Subject === subject)
    assert(found.length <= 1, `Mailpit holds an earlier « ${subject} » email to ${address}: clear the fixture's messages first`)
    if (found[0]) return found[0]
    await page.waitForTimeout(250)
  }
  throw new Error(`The « ${subject} » email never reached ${address} in the local Mailpit`)
}

/**
 * The first link of that kind in a delivered email, whole (never printed): the address its button
 * opens, on the organisation's own host, as the volunteer's browser would.
 */
async function mailLink(page: Page, mail: Mail, kind: "my" | "disponibilites"): Promise<string> {
  const detail = (await (await page.request.get(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as { Text: string }
  const link = new RegExp(`https?://[^\\s/]+/${kind}/[A-Za-z0-9_-]+`).exec(detail.Text)
  assert(link, `The email « ${mail.Subject} » has no /${kind}/ link`)
  return link[0]
}

/**
 * Makes this organisation's waiting emails of these kinds due now and runs the real outbox cron, as
 * the scheduled job does every five minutes. Only `nextAttemptAt` changes; the product renders and
 * sends. Returns how many of them left.
 */
async function deliverWaitingEmails(kinds: string[]): Promise<number> {
  const { PrismaClient } = await import("../../src/generated/prisma/client")
  const { pgAdapter } = await import("../../src/lib/prisma-adapter")
  assert(process.env.DATABASE_URL?.includes("benevoles_video"), "The outbox shortcut runs on the video database only")
  assert(process.env.CRON_SECRET, "Real cron authentication required")
  const db = new PrismaClient({ adapter: pgAdapter(process.env.DATABASE_URL) })
  try {
    const waiting = await db.notificationOutbox.findMany({ where: { organizationId: ORG_ID, status: "pending" }, select: { id: true, dedupeKey: true } })
    const due = waiting.filter((row) => kinds.some((kind) => row.dedupeKey?.startsWith(`${kind}:`)))
    assert(due.length > 0, `No waiting ${kinds.join(" or ")} email`)
    await db.notificationOutbox.updateMany({ where: { id: { in: due.map((row) => row.id) }, organizationId: ORG_ID, status: "pending" }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })
    const response = await fetch(`${LOCAL_APP}/api/cron/outbox`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    assert(response.ok, `Real outbox cron failed: ${response.status}`)
    const left = await db.notificationOutbox.count({ where: { id: { in: due.map((row) => row.id) }, status: "sent" } })
    assert.equal(left, due.length, "every due email was sent by the cron")
    return left
  } finally {
    await db.$disconnect()
  }
}

/**
 * Off screen, before the screencast, signed in as the owner: asks Emma for her availability through
 * the organisers' real route (her stored answer stays; she gets a real link), waits for that email,
 * keeps the owner's session and opens the drafts page. Fails when the fixture was used.
 */
export async function preparePublication(page: Page, base: string): Promise<PublicationSetup> {
  await page.goto(`${base}/admin/events/${EVENT_ID}/availability/drafts`)
  await page.getByRole("heading", { level: 1, name: "Affectations en brouillon", exact: true }).waitFor()
  assert.equal(await page.getByText(PB_EXPECTED.drafts, { exact: true }).count(), 1, "Publication fixture already used: run the assignment-publication seed")
  // Same-origin call from the organisers' page, as « Demander leurs disponibilités » makes it.
  const sent = await page.evaluate(async ({ eventId, volunteerId }) => {
    const response = await fetch(`/api/admin/events/${eventId}/availability`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ volunteerIds: [volunteerId] }) })
    return { status: response.status, body: (await response.json().catch(() => null)) as { emailsQueued?: number } | null }
  }, { eventId: EVENT_ID, volunteerId: person(PB_TYPED.emma.key) })
  assert.equal(sent.status, 200, "The availability request was refused: run the assignment-publication seed")
  assert.equal(sent.body?.emailsQueued, 1, "Emma was already sent a link: run the assignment-publication seed")
  const mail = await deliveredMail(page, email(PB_TYPED.emma.key), PB_EXPECTED.availabilitySubject)
  const availabilityLink = await mailLink(page, mail, "disponibilites")
  const ownerCookies = await page.context().cookies()
  await page.reload()
  await page.getByText(PB_EXPECTED.drafts, { exact: true }).waitFor()
  return { ownerCookies, availabilityMailId: mail.ID, availabilityLink }
}

export async function recordAssignmentPublication(options: Options) {
  const { page, base, title, scene, tap, settle, typeNaturally, setup } = options
  const exact = { exact: true } as const
  const go = async (route: string) => { await page.goto(`${base}${route}`); await settle(page) }
  const drafts = `/admin/events/${EVENT_ID}/availability/drafts`
  /** The planning cell of a person on the n-th date of the event (wide layout). */
  const cellOf = (key: string, day: number) => page.locator(`[id^="grid-cell-${person(key)}-"]`).nth(day)
  const mailBody = () => page.frameLocator("iframe").first()
  const openMail = async (id: string, greeting: string) => {
    await page.goto(`${MAILPIT}/view/${id}`)
    await mailBody().getByText(greeting, exact).waitFor()
  }
  /** Mailpit opens a message's links in a new tab: the take follows the same link in this one. */
  const followMailLink = async (name: string, link: string) => {
    const popup = page.context().waitForEvent("page", { timeout: 2_500 }).catch(() => null)
    await tap(page, mailBody().getByRole("link", { name, exact: true }))
    await (await popup)?.close()
    await page.goto(link); await settle(page)
  }
  const asVolunteer = async () => { await page.context().clearCookies() }
  const asOwner = async () => { await page.context().clearCookies(); await page.context().addCookies(setup.ownerCookies) }

  const publishHeading = page.getByRole("heading", { level: 2, name: "Publier les affectations", exact: true })
  await publishHeading.waitFor()

  await scene("pb-welcome", async () => {
    await page.screencast.showChapter(title, { description: "Les places prises, l'email de chaque bénévole, et ce qu'ils peuvent faire ensuite", duration: 2_400 })
  })

  await scene("pb-ready", async at => {
    await page.getByRole("heading", { level: 1, name: "Affectations en brouillon", exact: true }).waitFor()
    await publishHeading.scrollIntoViewIfNeeded()
    await page.getByText(PB_EXPECTED.drafts, exact).waitFor()
    assert.equal(await page.getByText(/points? empêchen?t la publication/).count(), 0, "nothing blocks the publication")
    await at("Sur le planning, ce sont encore des brouillons")
    // The drafts on the planning: Emma's Friday at the bar, still a draft.
    const emma = cellOf(PB_TYPED.emma.key, PB_TYPED.emma.day)
    await emma.scrollIntoViewIfNeeded()
    await emma.getByText("Brouillon", exact).waitFor()
  })

  const confirm = page.getByRole("dialog", { name: /^Publier les affectations\W+$/ })
  await scene("pb-publish", async at => {
    await publishHeading.scrollIntoViewIfNeeded()
    await page.getByText(PB_EXPECTED.drafts, exact).waitFor()
    await at("La confirmation le rappelle")
    await tap(page, page.getByRole("button", { name: "Publier les affectations", exact: true }))
    await confirm.waitFor()
    await confirm.getByText(PB_EXPECTED.confirm).waitFor()
    await confirm.getByText(PB_EXPECTED.confirmTakes).waitFor()
    assert.equal(await confirm.getByText(/pas d'adresse email/).count(), 0, "every person of the fixture has an email")
  })

  const done = page.getByRole("group", { name: "Publication faite" })
  await scene("pb-done", async at => {
    // « Confirmons avec Publier » ended the previous segment.
    await tap(page, confirm.getByRole("button", { name: "Publier", exact: true }))
    await confirm.waitFor({ state: "detached", timeout: 30_000 })
    await done.waitFor({ timeout: 30_000 })
    await done.getByText(PB_EXPECTED.published, exact).waitFor()
    await page.getByText(PB_EXPECTED.noDraft, exact).waitFor()
    await at("Sur le planning")
    const emma = cellOf(PB_TYPED.emma.key, PB_TYPED.emma.day)
    await emma.getByText(PB_EXPECTED.confirmed, exact).waitFor()
    await emma.scrollIntoViewIfNeeded()
    assert.equal(await emma.getByText("Brouillon", exact).count(), 0, "the draft became a mission")
  })

  await scene("pb-registrations", async at => {
    await done.scrollIntoViewIfNeeded()
    await at("La liste compte")
    await tap(page, done.getByRole("link", { name: "Voir les inscriptions", exact: true }))
    await page.waitForURL(/\/registrations$/); await settle(page)
    await page.getByText(PB_EXPECTED.registrations, exact).waitFor()
    await at("chacune avec la source Affectation publiée")
    const row = page.locator("tr").filter({ hasText: email(PB_TYPED.emma.key) }).first()
    await row.scrollIntoViewIfNeeded()
    await row.getByText(PB_EXPECTED.source, exact).waitFor()
    assert.equal(await page.locator("tr").filter({ hasText: PB_EXPECTED.source }).count(), 29, "every registration comes from the publication")
  })

  // The placement emails, delivered by the real cron once made due (off screen, during the voice).
  let emmaMail: Mail | undefined
  let noahMail: Mail | undefined
  await scene("pb-email", async at => {
    assert.equal(await deliverWaitingEmails(["registration_added_by_organizer"]), 11, "one grouped email per person")
    emmaMail = await deliveredMail(page, email(PB_TYPED.emma.key), PB_EXPECTED.emailSubject)
    noahMail = await deliveredMail(page, email(PB_TYPED.noah.key), PB_EXPECTED.emailSubject)
    await at("Voici celui d'Emma")
    await openMail(emmaMail.ID, `Hello ${PB_TYPED.emma.firstName},`)
    await mailBody().getByText(PB_EXPECTED.emailLead(PB_TYPED.emma.firstName, 2), exact).waitFor()
    assert.equal(await mailBody().getByRole("listitem").filter({ hasText: /^Bar des Tilleuls, / }).count(), 2, "Emma's two evenings at the bar")
    await mailBody().getByRole("link", { name: PB_EXPECTED.emailButton, exact: true }).waitFor()
  })

  const cards = page.locator("[id^='registration-']")
  const card = (poste: string) => cards.filter({ has: page.getByText(poste, exact) })
  await scene("pb-volunteer", async at => {
    // « Noah a reçu le même email »: his own, delivered by the same cron run.
    await openMail(noahMail!.ID, `Hello ${PB_TYPED.noah.firstName},`)
    await mailBody().getByText(PB_EXPECTED.emailLead(PB_TYPED.noah.firstName, 2), exact).waitFor()
    await mailBody().getByRole("listitem").filter({ hasText: /^Accueil, samedi / }).waitFor()
    await mailBody().getByRole("listitem").filter({ hasText: /^Parking, dimanche / }).waitFor()
    const noahLink = await mailLink(page, noahMail!, "my")
    await asVolunteer()
    await at("Sa page Mes inscriptions")
    await followMailLink(PB_EXPECTED.emailButton, noahLink)
    await page.getByRole("heading", { level: 1, name: PB_EXPECTED.myTitle, exact: true }).waitFor()
    const shifts = page.getByRole("heading", { level: 2, name: PB_EXPECTED.myShifts, exact: true })
    await shifts.evaluate(element => element.scrollIntoView({ block: "start" }))
    assert.equal(await card("Parking").count(), 1)
    assert.equal(await card("Accueil").count(), 1)
    await at("Ici, pas de bouton pour changer de mission")
    assert.equal(await page.getByRole("button", { name: /échanger|déplacer|changer de/i }).count(), 0, "no swap nor move offered on this event")
    await page.getByRole("link", { name: PB_EXPECTED.writeToOrganisation, exact: true }).first().waitFor()
  })

  await scene("pb-cancel", async at => {
    const parking = card("Parking")
    await at("Il peut laisser un mot pour l'organisation")
    await tap(page, parking.getByRole("button", { name: /^Annuler le créneau Parking/ }))
    await parking.getByText(PB_EXPECTED.cancelTitle, exact).waitFor()
    const message = parking.getByLabel(PB_EXPECTED.cancelMessage, exact)
    await at("Il écrit son message")
    await typeNaturally(page, message, PB_TYPED.message)
    assert.equal(await message.inputValue(), PB_TYPED.message)
    // Keep the typed words readable before the confirmation removes the form.
    await page.waitForTimeout(700)
    await at("Il lui reste son créneau de samedi")
    await tap(page, parking.getByRole("button", { name: PB_EXPECTED.cancelConfirm, exact: true }))
    await parking.waitFor({ state: "detached" })
    await card("Accueil").scrollIntoViewIfNeeded()
    assert.equal(await cards.count(), 1, "one shift left")
  })

  await scene("pb-withdrawal", async at => {
    assert.equal(await deliverWaitingEmails(["registration_cancelled"]), 1, "one withdrawal email to the owner")
    const mail = await deliveredMail(page, OWNER_EMAIL, PB_EXPECTED.withdrawalSubject)
    await openMail(mail.ID, PB_EXPECTED.placeMissing)
    await mailBody().getByText(PB_TYPED.message, exact).waitFor()
    await mailBody().getByText(fullNameOf(PB_TYPED.noah.firstName), exact).waitFor()
    await at("Trouver un remplaçant")
    await mailBody().getByRole("link", { name: PB_EXPECTED.replacement, exact: true }).waitFor()
  })

  await scene("pb-correct", async at => {
    await openMail(setup.availabilityMailId, `Bonjour ${PB_TYPED.emma.firstName},`)
    await mailBody().getByRole("link", { name: PB_EXPECTED.availabilityButton, exact: true }).waitFor()
    await at("La page le dit")
    await followMailLink(PB_EXPECTED.availabilityButton, setup.availabilityLink)
    await page.getByRole("heading", { level: 1, name: PB_EXPECTED.availabilityTitle, exact: true }).waitFor()
    await page.getByText(PB_EXPECTED.correction, exact).waitFor()
    await at("Pour vendredi")
    await page.locator("fieldset[data-availability-day]").nth(PB_TYPED.emma.day).scrollIntoViewIfNeeded()
  })

  await scene("pb-saved", async at => {
    // « elle choisit Pas disponible » ended the previous segment.
    const friday = page.locator("fieldset[data-availability-day]").nth(PB_TYPED.emma.day)
    await tap(page, friday.getByRole("radio", { name: PB_EXPECTED.unavailable, exact: true }))
    const save = page.getByRole("button", { name: PB_EXPECTED.save, exact: true })
    await save.scrollIntoViewIfNeeded()
    await at("La page confirme")
    await tap(page, save)
    const saved = page.getByRole("status").filter({ hasText: PB_EXPECTED.saved })
    await saved.waitFor()
    await saved.evaluate(element => element.scrollIntoView({ block: "center" }))
  })

  await scene("pb-review", async at => {
    await asOwner()
    await go(drafts)
    const review = page.getByRole("heading", { level: 3, name: PB_EXPECTED.toReview, exact: true })
    await review.waitFor()
    await review.scrollIntoViewIfNeeded()
    await page.getByText(PB_EXPECTED.toReviewNote, exact).waitFor()
    await page.getByRole("listitem").filter({ hasText: `${fullNameOf(PB_TYPED.emma.firstName)}, vendredi` }).filter({ hasText: "Bar des Tilleuls" }).waitFor()
    await at("Personne n'a été déplacé ni désinscrit")
    const emma = cellOf(PB_TYPED.emma.key, PB_TYPED.emma.day)
    await emma.getByText(PB_EXPECTED.cellReview, exact).waitFor()
    await emma.scrollIntoViewIfNeeded()
    await at("Dans sa case, Voir l'inscription")
    await emma.getByRole("link", { name: new RegExp(`^${PB_EXPECTED.seeRegistration}`) }).waitFor()
  })
}
