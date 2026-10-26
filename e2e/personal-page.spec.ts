import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"
import { clearMailbox, waitForMessage, getMessageText } from "./helpers/mailpit"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

/**
 * Withdrawing from the personal page (/my) with the keyboard (#534): the confirmation takes focus,
 * Escape and « Non, garder » give it back to the trigger, a withdrawal moves focus to a neighbouring
 * card and announces the result once, a failure keeps the page and says so under the card. Also axe
 * on the page, confirmation closed and open, the cards at 320 px, and « Mes réponses » (#984): the
 * volunteer's own answers to the event's questions, then changing them (part 2), the organisers
 * told by email (grouped; sent at once with DIGEST_DELAY_SECONDS=0, as in CI), and a question
 * attached to a poste (part 3), whose changes reach that poste's sector leader instead.
 */

let event: PublicEvent
const title = `E2E Page perso ${Date.now()}`

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, title, [
    // Room for every test's sign-up, the other member's of « Mes réponses » included.
    { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 10 },
    { label: "Accueil", startTime: "14:00", endTime: "16:00", capacity: 10 },
    { label: "Vestiaire", startTime: "17:00", endTime: "19:00", capacity: 10 },
  ], undefined, [
    { label: "Repas du soir ?", type: "yesno" },
    { label: "Taille de t-shirt ?", type: "single", options: ["S", "M", "L"] },
    { label: "Transport ?", type: "multiple", options: ["Voiture", "Vélo", "Train"] },
    { label: "Remarque ?", type: "text" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  // Its own client address: GET and DELETE on a personal token are rate limited per address.
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

/** Signs up for every shift of the event and opens the personal page, hydrated. */
async function openMyPage(page: Page, answers?: Record<string, unknown>): Promise<string> {
  const token = await publicSignUp(page, event, event.shifts.map((s) => s.id), answers)
  await page.goto(`/my/${token}`)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
  await waitForHydration(trigger(page, "Bar"))
  return token
}

const trigger = (page: Page, label: string) => page.getByRole("button", { name: `Annuler le créneau ${label}` })
const keep = (page: Page) => page.getByRole("button", { name: "Non, garder" })
const pageStatus = (page: Page) => page.locator("#withdraw-status")

test("withdrawing with the keyboard: focus in the confirmation, back on the trigger, then on the next card", async ({ page }) => {
  await openMyPage(page)
  const bar = trigger(page, "Bar")

  // 1. Opening: the trigger stays, focus on « Non, garder ».
  await bar.focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("alertdialog", { name: "Confirmer l'annulation ?" })
  await expect(dialog).toBeVisible()
  await expect(keep(page)).toBeFocused()
  await expect(bar).toHaveAttribute("aria-expanded", "true")

  // 2. Escape, then « Non, garder »: focus back on the trigger.
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(bar).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(keep(page)).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(bar).toBeFocused()

  // 3 and 4. « Oui, annuler »: the card goes, focus on the next card's trigger, result announced.
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByRole("button", { name: "Oui, annuler" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(bar).toHaveCount(0)
  await expect(trigger(page, "Accueil")).toBeFocused()
  await expect(pageStatus(page)).toHaveText(/^Créneau annulé : Bar, mardi 1 octobre, de 10h à 12h\.$/)

  // The last card of the list: focus on the previous one.
  await trigger(page, "Vestiaire").focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Enter")
  await expect(trigger(page, "Vestiaire")).toHaveCount(0)
  await expect(trigger(page, "Accueil")).toBeFocused()
  await expect(pageStatus(page)).toHaveText(/^Créneau annulé : Vestiaire, /)

  // 5. The last registration: the empty view's heading takes focus, the result is still voiced.
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { level: 1, name: "Toutes tes inscriptions ont été annulées" })).toBeFocused()
  await expect(pageStatus(page)).toHaveText(/^Créneau annulé : Accueil, /)
})

test("links to the event's sign-up page for more shifts, the bottom link gone (#988)", async ({ page }) => {
  await openMyPage(page)
  const more = page.getByRole("link", { name: "S'inscrire à d'autres créneaux" })
  await expect(more).toBeVisible()
  await expect(page.getByRole("link", { name: "Voir la page de l'événement" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Retour à l'accueil" })).toHaveCount(0)
  await more.click()
  await expect(page).toHaveURL((url) => url.pathname === `/${event.slug}`)
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
})

test("« Mon calendrier »: a read-only subscription, never the personal link, that follows a withdrawal (#961)", async ({ page }) => {
  const token = await openMyPage(page)
  const card = page.getByRole("region", { name: "Mon calendrier" })
  const subscribe = card.getByRole("link", { name: "S'abonner avec l'agenda de cet appareil" })
  await expect(subscribe).toHaveAttribute("href", /^webcal:\/\/.+\/calendar\.ics$/)
  expect(await subscribe.getAttribute("href")).not.toContain(token)
  await expect(card.getByRole("link", { name: "Télécharger tout mon planning (fichier .ics)" })).toBeVisible()

  await card.getByText("Google Agenda ou autre agenda en ligne").click()
  const address = (await card.locator("span[translate=no]").textContent())!.trim()
  expect(address).toMatch(/^https?:\/\/.+\/calendar\.ics$/)
  const path = new URL(address).pathname
  const fetchFeed = async () => {
    const res = await page.request.get(path, { headers: { "x-forwarded-for": randomIp() } })
    expect(res.status(), await res.text()).toBe(200)
    expect(res.headers()["cache-control"]).toBe("private, no-store")
    expect(res.headers()["referrer-policy"]).toBe("no-referrer")
    return res.text()
  }
  const before = await fetchFeed()
  expect(before.split("BEGIN:VEVENT")).toHaveLength(4)
  expect(before).not.toContain(token)
  expect(before).not.toContain("/my/")

  // The personal token itself opens no calendar at that address.
  expect((await page.request.get(`/api/public/registrations/${token}/calendar.ics`, { headers: { "x-forwarded-for": randomIp() } })).status()).toBe(404)

  // A withdrawn shift drops out of the next fetch.
  await trigger(page, "Bar").click()
  await page.getByRole("button", { name: "Oui, annuler" }).click()
  await expect(trigger(page, "Bar")).toHaveCount(0)
  const after = await fetchFeed()
  expect(after.split("BEGIN:VEVENT")).toHaveLength(3)
})

test("a message left on withdrawal reaches the organizer's email (#559)", async ({ page }) => {
  await clearMailbox()
  await openMyPage(page)
  const bar = trigger(page, "Bar")
  await bar.click()
  await expect(keep(page)).toBeFocused()

  const message = `Je suis malade, Paul peut me remplacer ${Date.now()}`
  await page.getByLabel("Un mot pour l'organisation ? (facultatif)").fill(message)
  await page.getByRole("button", { name: "Oui, annuler" }).click()
  await expect(bar).toHaveCount(0)

  const mail = await waitForMessage(`to:"${ORG_ADMIN_EMAIL}" subject:"Désistement"`)
  const text = await getMessageText(mail.ID)
  expect(text).toContain(message)
})

test("a failed withdrawal keeps the page, says so under the card and gives focus back to the trigger", async ({ page }) => {
  await openMyPage(page)
  await page.route("**/api/public/registrations/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Erreur" }) })
      : route.fallback(),
  )
  const bar = trigger(page, "Bar")
  await bar.focus()
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Enter")

  const alert = page.locator("[id^='withdraw-error-']").filter({ hasText: /./ })
  await expect(alert).toHaveText("L'annulation n'a pas abouti : rien n'a été annulé. Réessaie dans un moment.")
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute("role", "alert")
  await expect(bar).toBeFocused()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect(page.getByRole("heading", { level: 1, name: "Mes inscriptions" })).toBeVisible()
  await expect(page.getByText("Ce lien ne fonctionne pas")).toHaveCount(0)
  await expect(pageStatus(page)).toHaveText("")
})

test("« Mes réponses » shows the volunteer's own answers in form order (#984)", async ({ page }) => {
  const [meal, size, transport, note] = event.questions
  // Another member of the same event, with other answers: never on this page.
  await publicSignUp(page, event, [event.shifts[0].id], { [meal.id]: "Non", [size.id]: "L", [note.id]: "Réponse de quelqu'un d'autre" })
  await openMyPage(page, { [meal.id]: "Oui", [transport.id]: ["Vélo", "Train"] })

  const answers = page.getByRole("region", { name: "Mes réponses" })
  await expect(answers).toBeVisible()
  await expect(answers.getByRole("term")).toHaveText(["Repas du soir ?", "Taille de t-shirt ?", "Transport ?", "Remarque ?"])
  await expect(answers.getByRole("definition")).toHaveText(["Oui", "Pas de réponse", "Vélo, Train", "Pas de réponse"])
  await expect(answers.getByText("Réponse de quelqu'un d'autre")).toHaveCount(0)
  // At rest: one button to change them, no field.
  await expect(answers.getByRole("button")).toHaveText(["Modifier mes réponses"])
  await expect(answers.getByRole("textbox")).toHaveCount(0)
  // Under the registrations, as the page's other sections, below its title.
  await expect(page.getByRole("heading", { level: 2, name: "Mes réponses" })).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])
})

test("changing an answer: saved, shown, focus back on the button, the organisers told (#984, part 2)", async ({ page }) => {
  await clearMailbox()
  const [meal, size] = event.questions
  await openMyPage(page, { [meal.id]: "Oui", [size.id]: "M" })
  const answers = page.getByRole("region", { name: "Mes réponses" })
  const edit = answers.getByRole("button", { name: "Modifier mes réponses" })

  // Opening: the sign-up form's fields, prefilled, focus on the first one (the checked choice).
  await edit.click()
  const form = answers.getByRole("form", { name: "Modifier mes réponses" })
  await expect(form.getByRole("radio", { name: "Oui" })).toBeFocused()
  await expect(form.getByRole("radio", { name: "M" })).toBeChecked()
  expect.soft(await seriousViolations(page)).toEqual([])

  // Annuler: nothing saved, focus back on the button.
  await form.getByRole("radio", { name: "Non" }).check()
  await form.getByRole("button", { name: "Annuler" }).click()
  await expect(edit).toBeFocused()
  await expect(answers.getByRole("definition").first()).toHaveText("Oui")

  // Changed and saved, with the keyboard for the text.
  await edit.click()
  await form.getByRole("radio", { name: "Non" }).check()
  await form.getByRole("textbox", { name: /Remarque/ }).fill("J'arrive à 19h")
  await form.getByRole("button", { name: "Enregistrer" }).click()
  await expect(answers.getByRole("status")).toHaveText("Réponses enregistrées.")
  await expect(edit).toBeFocused()
  await expect(answers.getByRole("definition")).toHaveText(["Non", "M", "Pas de réponse", "J'arrive à 19h"])

  // Still there after a reload: saved on the server.
  await page.reload()
  await expect(page.getByRole("region", { name: "Mes réponses" }).getByRole("definition").first()).toHaveText("Non")

  // The organisers' email, grouped like withdrawals.
  const mail = await waitForMessage(`to:"${ORG_ADMIN_EMAIL}" subject:"Réponses modifiées"`)
  const text = await getMessageText(mail.ID)
  expect(text).toContain("« Repas du soir ? » : « Oui » → « Non »")
  expect(text).toContain("« Remarque ? » : pas de réponse → « J'arrive à 19h »")
})

test("a required answer can't be cleared: the field says why and takes focus (#984, part 2)", async ({ page }) => {
  const [, size] = event.questions
  await openMyPage(page)
  // The organiser makes a question required after the sign-up: the form asks for it.
  await page.route("**/api/public/registrations/*/answers", (route) => route.fulfill({
    status: 400, contentType: "application/json",
    body: JSON.stringify({ error: "« Taille de t-shirt ? » est obligatoire.", questionErrors: [{ questionId: size.id, message: "« Taille de t-shirt ? » est obligatoire." }] }),
  }))
  const answers = page.getByRole("region", { name: "Mes réponses" })
  await answers.getByRole("button", { name: "Modifier mes réponses" }).click()
  await answers.getByRole("button", { name: "Enregistrer" }).click()
  // Focus on the group's checked choice, as the browser's own arrow keys would start from.
  const first = answers.getByRole("group", { name: /Taille de t-shirt/ }).getByRole("radio", { name: "Pas de réponse" })
  await expect(first).toBeFocused()
  await expect(first).toHaveAccessibleDescription("« Taille de t-shirt ? » est obligatoire.")
  await expect(answers.getByRole("form")).toBeVisible()
})

test("a question attached to a poste: its change goes to the poste's leader, the others to the organisers (#984, part 3)", async ({ page, browser }) => {
  const [, size, transport] = event.questions
  const leaderEmail = `e2e-chef-accueil-${Date.now()}@example.com`

  // The organiser names a leader for « Accueil », then attaches « Transport ? » to that poste.
  // Its own context: axe needs one (not browser.newPage()).
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await admin.goto("/admin/login")
  await admin.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await admin.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await admin.getByRole("button", { name: "Se connecter" }).click()
  await expect(admin).toHaveURL(/\/admin\/dashboard/)
  const lead = await admin.request.post(`/api/admin/events/${event.eventId}/sector-leaders`, { data: { roleName: "Accueil", name: "Chef Accueil", email: leaderEmail } })
  expect(lead.ok(), await lead.text()).toBeTruthy()
  await admin.goto(`/admin/events/${event.eventId}/questions`)
  await waitForHydration(admin.getByRole("button", { name: "Modifier la question « Transport ? »" }))
  await admin.getByRole("button", { name: "Modifier la question « Transport ? »" }).click()
  const role = admin.getByRole("combobox", { name: "Poste concerné" })
  await expect(role).toHaveValue("")
  await expect(role).toHaveAccessibleDescription(/aux responsables de ce poste au lieu de vous/)
  await role.selectOption("Accueil")
  await admin.getByRole("button", { name: "Enregistrer" }).click()
  await expect(admin.getByText("Question « Transport ? » enregistrée.")).toBeVisible()
  await expect(admin.getByText(/Poste : Accueil/)).toBeVisible()
  expect.soft(await seriousViolations(admin)).toEqual([])
  await adminContext.close()

  // The volunteer changes both answers in one save.
  await clearMailbox()
  await openMyPage(page, { [size.id]: "M", [transport.id]: ["Vélo"] })
  const answers = page.getByRole("region", { name: "Mes réponses" })
  await answers.getByRole("button", { name: "Modifier mes réponses" }).click()
  const form = answers.getByRole("form", { name: "Modifier mes réponses" })
  await form.getByRole("radio", { name: "L" }).check()
  await form.getByRole("checkbox", { name: "Train" }).check()
  await form.getByRole("button", { name: "Enregistrer" }).click()
  await expect(answers.getByRole("status")).toHaveText("Réponses enregistrées.")

  // The leader gets the poste's question, with their personal link, not the admin pages.
  const toLeader = await waitForMessage(`to:"${leaderEmail}" subject:"Réponse modifiée"`)
  expect(toLeader.Subject).toBe("Réponse modifiée — Accueil")
  const leaderText = await getMessageText(toLeader.ID)
  expect(leaderText).toContain("« Transport ? » : « Vélo » → « Vélo, Train »")
  expect(leaderText).not.toContain("Taille")
  expect(leaderText).toMatch(/\/leader\/[\w-]+/)
  // The organisers get the other one only.
  const toAdmin = await waitForMessage(`to:"${ORG_ADMIN_EMAIL}" subject:"Réponse modifiée"`)
  const adminText = await getMessageText(toAdmin.ID)
  expect(adminText).toContain("« Taille de t-shirt ? » : « M » → « L »")
  expect(adminText).not.toContain("Transport")
})

test("/my has no serious axe violation, confirmation closed and open", async ({ page }) => {
  await openMyPage(page)
  expect.soft(await seriousViolations(page)).toEqual([])
  await trigger(page, "Bar").click()
  await expect(keep(page)).toBeFocused()
  expect.soft(await seriousViolations(page)).toEqual([])
})

test.describe("at 320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } })

  test("cards fit: no horizontal scroll, each trigger whole and in the viewport", async ({ page }) => {
    await openMyPage(page)
    const root = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(root.scroll).toBeLessThanOrEqual(root.client)
    for (const { label } of event.shifts) {
      const button = trigger(page, label)
      await button.scrollIntoViewIfNeeded()
      const box = await button.boundingBox()
      expect(box, label).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(320)
      expect(box!.height).toBeGreaterThanOrEqual(24)
      // Not truncated: the label fits in its box.
      const clipped = await button.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)
      expect(clipped, label).toBe(false)
    }
    // The confirmation fits too.
    await trigger(page, "Bar").click()
    const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(after).toBeLessThanOrEqual(0)
    for (const name of [/^Oui, /, "Non, garder"]) {
      const box = await page.getByRole("alertdialog").getByRole("button", { name }).boundingBox()
      expect(box, String(name)).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(320)
      expect(box!.height).toBeGreaterThanOrEqual(24)
    }
  })
})

// A link of a deactivated or suspended organisation: the API refuses it (403 « org_unavailable »,
// covered against Postgres by src/__integration__/org-lifecycle-links.int.test.ts); the page shows
// « Espace indisponible » and the contact address, nothing else, for a volunteer and a sector leader.
test("a link of a closed organisation shows « Espace indisponible », nothing of the link", async ({ page }) => {
  const refusal = { error: "Cet espace n'est pas disponible.", code: "org_unavailable", contact: "aide@example.org" }
  await page.route("**/api/public/registrations/closed-org-link", (route) => route.fulfill({ status: 403, json: refusal }))
  await page.route("**/api/public/leader/closed-org-link", (route) => route.fulfill({ status: 403, json: refusal }))

  await page.goto("/my/closed-org-link")
  await expect(page.getByRole("heading", { level: 1, name: "Espace indisponible" })).toBeVisible()
  await expect(page).toHaveTitle("Espace indisponible — Bénévoles")
  await expect(page.getByText("ce lien ne donne plus accès à tes inscriptions")).toBeVisible()
  await expect(page.getByRole("link", { name: "aide@example.org" })).toHaveAttribute("href", "mailto:aide@example.org")
  await expect(page.getByText("Ce lien ne fonctionne pas")).toHaveCount(0)
  await expect(page.getByRole("button")).toHaveCount(0)
  expect.soft(await seriousViolations(page)).toEqual([])

  await page.goto("/leader/closed-org-link")
  await expect(page.getByRole("heading", { level: 1, name: "Espace indisponible" })).toBeVisible()
  await expect(page.getByText("ce lien ne donne plus accès à la liste des bénévoles")).toBeVisible()
  await expect(page.getByText(/écrivez à/)).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])
})
