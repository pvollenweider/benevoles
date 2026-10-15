import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { createPublicEvent, publicSignUp, randomIp, type PublicEvent } from "./helpers/public-signup"
import { clearMailbox, getMessageText, waitForMessage } from "./helpers/mailpit"

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"

/**
 * More shifts from the personal page (#1013): « S'inscrire à d'autres créneaux » opens the event's
 * sign-up with the volunteer's session; the form starts from their answers (as « Mes réponses »),
 * and a changed answer and phone are saved, said on the confirmation, shown back on the personal
 * page, and the organisers told by the grouped email (sent at once with DIGEST_DELAY_SECONDS=0,
 * as in CI). Without any change, nothing is said nor sent.
 */

let event: PublicEvent

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000)
  event = await createPublicEvent(browser, `E2E Plus de créneaux ${Date.now()}`, [
    { label: "Bar", startTime: "10:00", endTime: "12:00", capacity: 10 },
    { label: "Accueil", startTime: "14:00", endTime: "16:00", capacity: 10 },
    { label: "Vestiaire", startTime: "17:00", endTime: "19:00", capacity: 10 },
  ], undefined, [
    { label: "Taille de t-shirt ?", type: "single", options: ["S", "M", "L"] },
    { label: "Remarque ?", type: "text" },
  ])
})

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000) // dev server compiles each page on first visit
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
})

/** From the personal page to the form for one more shift. */
async function openFormFromMyPage(page: Page, token: string, shiftLabel: string) {
  await page.goto(`/my/${token}`)
  const link = page.getByRole("link", { name: "S'inscrire à d'autres créneaux" })
  await waitForHydration(link)
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/${event.slug}`))
  // The session is read after mounting: the held shift then says it is held.
  const pick = page.getByRole("button", { name: new RegExp(`${shiftLabel}.*: sélectionner`) })
  await waitForHydration(pick)
  await pick.click()
  await page.getByRole("button", { name: /^Continuer/ }).first().click()
  await expect(page.getByRole("heading", { level: 2, name: "Tes informations" })).toBeFocused()
}

async function confirm(page: Page) {
  await page.getByRole("button", { name: "convention des bénévoles" }).click()
  await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await page.getByLabel(/J.accepte que l.association/).check()
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(page).toHaveURL(new RegExp(`/${event.slug}/success`))
}

test("the form starts from the answers; a changed answer and phone are saved and told (#1013)", async ({ page }) => {
  await clearMailbox()
  const [size, note] = event.questions
  const token = await publicSignUp(page, event, [event.shifts[0].id], { [size.id]: "M", [note.id]: "Végétarien" })
  await openFormFromMyPage(page, token, "Accueil")

  // Prefilled as « Mes réponses », and the form says that changes are saved.
  await expect(page.getByRole("radio", { name: "M", exact: true })).toBeChecked()
  await expect(page.getByRole("textbox", { name: /Remarque/ })).toHaveValue("Végétarien")
  await expect(page.getByText("Ton nom, ton téléphone et tes réponses sont repris de ton inscription à cet événement.", { exact: false })).toBeVisible()
  await expect(page.getByLabel("Email *", { exact: true })).toHaveAccessibleDescription(/C'est l'adresse de ton inscription/)
  expect.soft(await seriousViolations(page)).toEqual([])

  await page.getByRole("radio", { name: "L", exact: true }).check()
  await page.getByLabel(/^Téléphone/).fill("079 555 12 34")
  await confirm(page)
  await expect(page.getByRole("status").filter({ hasText: "Inscription confirmée" })).toContainText("Modifications enregistrées : ton téléphone et 1 réponse.")

  // On the personal page: the new answer, both shifts.
  await page.goto(`/my/${token}`)
  const answers = page.getByRole("region", { name: "Mes réponses" })
  await expect(answers.getByRole("definition")).toHaveText(["L", "Végétarien"])
  await expect(page.getByRole("button", { name: /Annuler le créneau/ })).toHaveCount(2)
  // The phone the personal page holds: the next sign-up form starts from it.
  await openFormFromMyPage(page, token, "Vestiaire")
  await expect(page.getByLabel(/^Téléphone/)).toHaveValue("079 555 12 34")

  // The organisers' grouped email, as for a change from the personal page.
  const mail = await waitForMessage(`to:"${ORG_ADMIN_EMAIL}" subject:"Réponse modifiée"`)
  const text = await getMessageText(mail.ID)
  expect(text).toContain("« Taille de t-shirt ? » : « M » → « L »")
})

test("nothing changed: the sign-up goes through, nothing is said as updated (#1013)", async ({ page }) => {
  const [size] = event.questions
  const token = await publicSignUp(page, event, [event.shifts[0].id], { [size.id]: "S" })
  await openFormFromMyPage(page, token, "Vestiaire")
  await expect(page.getByRole("radio", { name: "S", exact: true })).toBeChecked()
  await confirm(page)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByText("Modifications enregistrées")).toHaveCount(0)
  await page.goto(`/my/${token}`)
  await expect(page.getByRole("region", { name: "Mes réponses" }).getByRole("definition")).toHaveText(["S", "Pas de réponse"])
})
