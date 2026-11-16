import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { randomIp } from "./helpers/public-signup"
import { waitForHydration } from "./helpers/hydration"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * « Synthèse des réponses » of an event's Questions page (#686): one captioned table per question,
 * each confirmed volunteer counted once, pending ones apart; the same summary as CSV and as a
 * printable sheet.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("counts confirmed volunteers once, pending apart, and exports the summary", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)

  const stamp = Date.now()
  const post = async (url: string, body: unknown, headers?: Record<string, string>) => {
    const res = await page.request.post(url, { data: body, headers })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Synthèse ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" })
  const bar = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 5 })
  const accueil = await post("/api/admin/shifts", { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 5 })
  const control = await post("/api/admin/shifts", { eventId: event.id, roleName: "Contrôle", label: "Contrôle", date: "2030-10-01", startTime: "17:00", endTime: "19:00", capacity: 3, requiresApproval: true })
  const size = await post(`/api/admin/events/${event.id}/questions`, { label: "Taille de t-shirt", type: "single", options: ["S", "M", "L"] })
  const diet = await post(`/api/admin/events/${event.id}/questions`, { label: "Régime", type: "text" })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  const signUp = (who: string, shiftIds: string[], answers: Record<string, string>) =>
    post("/api/public/registrations", {
      eventId: event.id, shiftIds, firstName: "E2E", lastName: `${who}${stamp}`, email: `e2e-sum-${who.toLowerCase()}-${stamp}@example.com`, consent: true, charterAccepted: true, answers,
    }, { "x-forwarded-for": randomIp() })
  // Two shifts, one t-shirt.
  await signUp("Alice", [bar.id, accueil.id], { [size.id]: "M", [diet.id]: "Végétarien" })
  await signUp("Bruno", [bar.id], { [size.id]: "M", [diet.id]: "vegetarien" })
  // Waiting for approval only: counted apart.
  await signUp("Chloe", [control.id], { [size.id]: "L" })

  await page.goto(`/admin/events/${event.id}/questions`)
  const summary = page.getByRole("region", { name: "Synthèse des réponses" })
  await expect(summary).toBeVisible()
  await expect(summary.getByText(/^État au \d{1,2} \S+ \d{4} à \d{1,2}h(\d{2})?$/)).toBeVisible()
  await expect(summary.getByText(/2 bénévoles confirmés/)).toBeVisible()

  const sizes = summary.getByRole("table", { name: "Taille de t-shirt" })
  await expect(sizes.getByRole("columnheader")).toHaveText(["Réponse", "Confirmés", "En attente"])
  await expect(sizes.getByRole("row")).toHaveText([/Réponse/, /^S\s*0\s*0$/, /^M\s*2\s*0$/, /^L\s*0\s*1$/, /^Sans réponse\s*0\s*0$/])
  const diets = summary.getByRole("table", { name: "Régime" })
  await expect(diets.getByRole("row").nth(1)).toHaveText(/^Végétarien\s*2\s*0$/)
  await expect(diets.getByRole("row").nth(2)).toHaveText(/^Sans réponse\s*0\s*1$/)
  expect(await seriousViolations(page)).toEqual([])

  const csv = await page.request.get(`/api/admin/events/${event.id}/export/answers`)
  expect(csv.ok()).toBeTruthy()
  expect(csv.headers()["content-type"]).toContain("text/csv")
  const lines = (await csv.text()).replace(/^﻿/, "").split("\r\n")
  expect(lines[0]).toBe("Question;Réponse;Confirmés;En attente")
  expect(lines).toContain("Taille de t-shirt;M;2;0")
  expect(lines).toContain("Taille de t-shirt;L;0;1")

  const sheet = await page.request.get(`/api/admin/events/${event.id}/export/sheets/answers`)
  expect(sheet.ok()).toBeTruthy()
  const html = await sheet.text()
  expect(html).toContain("<caption>Taille de t-shirt</caption>")
  expect(html).not.toContain(`Alice${stamp}`)
})

test("a « Nombre » question is summed: one volunteer answers 3, another 2, the summary shows 5 (#1015)", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)

  const stamp = Date.now()
  const post = async (url: string, body: unknown, headers?: Record<string, string>) => {
    const res = await page.request.post(url, { data: body, headers })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Nombre ${stamp}`, startDate: "2030-10-02", endDate: "2030-10-02", publicStatus: "draft" })
  const bar = await post("/api/admin/shifts", { eventId: event.id, roleName: "Buvette", label: "Buvette", date: "2030-10-02", startTime: "10:00", endTime: "12:00", capacity: 5 })

  // The organiser adds the question in the editor.
  await page.goto(`/admin/events/${event.id}/questions`)
  const add = page.getByRole("button", { name: "Ajouter une question" })
  await waitForHydration(add)
  await add.click()
  await page.getByLabel(/Question posée aux bénévoles/).fill("Combien de personnes ?")
  await page.getByLabel("Type de réponse").selectOption({ label: "Nombre" })
  await page.getByRole("textbox", { name: "Maximum (facultatif)" }).fill("10")
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByText("Nombre : 10 au plus · 0 réponse")).toBeVisible()
  const questions = await (await page.request.get(`/api/admin/events/${event.id}/questions`)).json()
  const guests = questions.find((q: { label: string }) => q.label === "Combien de personnes ?")
  expect(guests).toMatchObject({ type: "number", minValue: 0, maxValue: 10 })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  // A volunteer answers on the public form: over the maximum is refused on the field, 3 goes through.
  const volunteer = await page.context().browser()!.newPage({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } })
  await volunteer.goto(`/${event.slug}?org=default`)
  const pick = volunteer.getByRole("button", { name: /Buvette.*: sélectionner/ }).first()
  await waitForHydration(pick)
  await pick.click()
  await volunteer.getByRole("button", { name: /^Continuer/ }).first().click()
  await volunteer.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await volunteer.getByLabel("Nom *", { exact: true }).fill(`Trois${stamp}`)
  await volunteer.getByLabel("Email *", { exact: true }).fill(`e2e-num-3-${stamp}@example.com`)
  const field = volunteer.getByRole("textbox", { name: "Combien de personnes ? (facultatif)" })
  await expect(field).toHaveAttribute("inputmode", "numeric")
  await expect(field).toHaveAccessibleDescription("Un nombre entier, 10 au plus.")
  await field.fill("12")
  await volunteer.getByRole("button", { name: "convention des bénévoles" }).click()
  await volunteer.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await volunteer.getByLabel(/J.accepte que l.association/).check()
  await volunteer.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(field).toHaveAttribute("aria-invalid", "true")
  await expect(field).toHaveAccessibleDescription(/au plus 10/)
  await field.fill("3")
  await volunteer.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(volunteer).toHaveURL(new RegExp(`/${event.slug}/success`))
  await volunteer.close()

  // Another one answers 2 through the API.
  await post("/api/public/registrations", {
    eventId: event.id, shiftIds: [bar.id], firstName: "E2E", lastName: `Deux${stamp}`, email: `e2e-num-2-${stamp}@example.com`, consent: true, charterAccepted: true, answers: { [guests.id]: "2" },
  }, { "x-forwarded-for": randomIp() })

  await page.goto(`/admin/events/${event.id}/questions`)
  const summary = page.getByRole("region", { name: "Synthèse des réponses" })
  const table = summary.getByRole("table", { name: /^Combien de personnes \?/ })
  await expect(table.getByRole("row")).toHaveText([/Réponse/, /^Total\s*5$/, /^Nombre de réponses\s*2$/, /^Sans réponse\s*0$/])
  await expect(table).toContainText("Somme des nombres indiqués par les bénévoles confirmés.")
  expect(await seriousViolations(page)).toEqual([])

  const csv = await page.request.get(`/api/admin/events/${event.id}/export/answers`)
  const lines = (await csv.text()).replace(/^﻿/, "").split("\r\n")
  expect(lines).toContain("Combien de personnes ?;Total;5;0")
  expect(lines).toContain("Combien de personnes ?;Nombre de réponses;2;0")
})

test("a follow-up « Nombre » shown only after « Oui », summed for those concerned, cleared on /my after « Non » (#1016)", async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)

  const stamp = Date.now()
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Suivi ${stamp}`, startDate: "2030-10-03", endDate: "2030-10-03", publicStatus: "draft" })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Cuisine", label: "Cuisine", date: "2030-10-03", startTime: "10:00", endTime: "12:00", capacity: 5 })
  await post(`/api/admin/events/${event.id}/questions`, { label: "Tu manges avec nous vendredi soir ?", type: "yesno", required: true })

  // The organiser adds the follow-up in the editor: a number, shown only after « Oui ».
  await page.goto(`/admin/events/${event.id}/questions`)
  const add = page.getByRole("button", { name: "Ajouter une question" })
  await waitForHydration(add)
  await add.click()
  await page.getByLabel(/Question posée aux bénévoles/).fill("Combien de personnes ?")
  await page.getByLabel("Type de réponse").selectOption({ label: "Nombre" })
  await page.getByLabel("Réponse obligatoire").check()
  await page.getByRole("combobox", { name: "Afficher seulement si…" }).selectOption({ label: "Tu manges avec nous vendredi soir ?" })
  await page.getByRole("group", { name: /Réponses qui affichent cette question/ }).getByRole("checkbox", { name: "Oui" }).check()
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await expect(page.getByRole("status").filter({ hasText: "placée après" })).toContainText("Elle est placée après « Tu manges avec nous vendredi soir ? »")
  await expect(page.getByText("Question de suivi · Si « Oui » à « Tu manges avec nous vendredi soir ? »")).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  /** A volunteer on the public form: the follow-up appears after « Oui » only. */
  async function signUp(who: string, meal: "Oui" | "Non", guests?: string): Promise<string> {
    const volunteer = await page.context().browser()!.newPage({ extraHTTPHeaders: { "x-forwarded-for": randomIp() }, locale: "fr-CH" })
    await volunteer.goto(`/${event.slug}?org=default`)
    const pick = volunteer.getByRole("button", { name: /Cuisine.*: sélectionner/ }).first()
    await waitForHydration(pick)
    await pick.click()
    await volunteer.getByRole("button", { name: /^Continuer/ }).first().click()
    const email = `e2e-suivi-${who.toLowerCase()}-${stamp}@example.com`
    await volunteer.getByLabel("Prénom *", { exact: true }).fill("E2E")
    await volunteer.getByLabel("Nom *", { exact: true }).fill(`${who}${stamp}`)
    await volunteer.getByLabel("Email *", { exact: true }).fill(email)
    const followUp = volunteer.getByRole("textbox", { name: "Combien de personnes ?" })
    await expect(followUp).toHaveCount(0)
    await volunteer.getByRole("radio", { name: meal, exact: true }).check()
    if (meal === "Oui") {
      await expect(followUp).toBeVisible()
      await followUp.fill(guests ?? "")
    } else {
      await expect(followUp).toHaveCount(0)
    }
    await volunteer.getByRole("button", { name: "convention des bénévoles" }).click()
    await volunteer.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
    await volunteer.getByLabel(/J.accepte que l.association/).check()
    await volunteer.getByRole("button", { name: "Confirmer mon inscription" }).click()
    await expect(volunteer).toHaveURL(new RegExp(`/${event.slug}/success`))
    await volunteer.close()
    const mail = await waitForMessage(`to:"${email}"`)
    return (await getMessageText(mail.ID)).match(/\/my\/([\w-]+)/)?.[1] ?? ""
  }
  const alice = await signUp("Alice", "Oui", "3")
  await signUp("Bruno", "Non")

  await page.goto(`/admin/events/${event.id}/questions`)
  const summary = page.getByRole("region", { name: "Synthèse des réponses" })
  const table = summary.getByRole("table", { name: /^Combien de personnes \?/ })
  await expect(table).toContainText("Posée seulement si « Oui » à « Tu manges avec nous vendredi soir ? » : 1 bénévole confirmé concerné.")
  // Bruno said « Non »: not counted as « Sans réponse ».
  await expect(table.getByRole("row")).toHaveText([/Réponse/, /^Total\s*3$/, /^Nombre de réponses\s*1$/, /^Sans réponse\s*0$/])
  expect(await seriousViolations(page)).toEqual([])

  // Alice changes « Oui » to « Non » on her personal page: the follow-up goes, and its answer with it.
  expect(alice).toBeTruthy()
  await page.goto(`/my/${alice}`)
  const answers = page.getByRole("region", { name: "Mes réponses" })
  await expect(answers.getByRole("definition")).toHaveText(["Oui", "3"])
  const edit = answers.getByRole("button", { name: "Modifier mes réponses" })
  await waitForHydration(edit)
  await edit.click()
  await expect(answers.getByRole("textbox", { name: "Combien de personnes ?" })).toHaveValue("3")
  await answers.getByRole("radio", { name: "Non", exact: true }).check()
  await expect(answers.getByRole("textbox", { name: "Combien de personnes ?" })).toHaveCount(0)
  await answers.getByRole("button", { name: "Enregistrer" }).click()
  await expect(answers.getByRole("status")).toHaveText("Réponses enregistrées.")
  await expect(answers.getByRole("definition")).toHaveText(["Non"])

  await page.goto(`/admin/events/${event.id}/questions`)
  await expect(page.getByRole("table", { name: /^Combien de personnes \?/ }).getByRole("row")).toHaveText([/Réponse/, /^Total\s*0$/, /^Nombre de réponses\s*0$/, /^Sans réponse\s*0$/])
  const questions = await (await page.request.get(`/api/admin/events/${event.id}/questions`)).json()
  expect(questions.find((q: { label: string }) => q.label === "Combien de personnes ?")._count.answers).toBe(0)
})
