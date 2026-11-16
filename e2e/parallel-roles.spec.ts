import { test, expect } from "@playwright/test"
import { createPublicEvent, randomIp } from "./helpers/public-signup"
import { waitForHydration } from "./helpers/hydration"

/**
 * A role « Cumulable avec un autre créneau » (#986): the organiser turns it on in « Gérer les
 * postes », then a volunteer can take one of its shifts and an overlapping one; without the option
 * the overlap stays refused, on the page and by the server.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("a cumulable role lets a volunteer sign up to two overlapping shifts, an ordinary one does not", async ({ page, browser }) => {
  test.slow()
  const stamp = Date.now()
  const event = await createPublicEvent(browser, `E2E Cumul ${stamp}`, [
    { label: "Buvette", startTime: "10:00", endTime: "14:00" },
    { label: "Secours", startTime: "09:00", endTime: "17:00" },
    { label: "Accueil", startTime: "12:00", endTime: "13:00" },
  ], "2030-10-04")
  const id = (label: string) => event.shifts.find((s) => s.label === label)!.id

  // Without the option, the server refuses the overlap.
  const signUp = (shiftIds: string[]) => page.request.post("/api/public/registrations", {
    headers: { "x-forwarded-for": randomIp() },
    data: { eventId: event.eventId, shiftIds, firstName: "E2E", lastName: `Cumul${Math.random()}`, email: `e2e-cumul-${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`, consent: true, charterAccepted: true },
  })
  expect((await signUp([id("Buvette"), id("Secours")])).status()).toBe(400)

  // The organiser makes « Secours » cumulable.
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard/)
  await page.goto(`/admin/events/${event.eventId}/shifts`)
  const manage = page.getByRole("button", { name: "Gérer les postes" })
  await waitForHydration(manage)
  await manage.click()
  const cumul = page.getByRole("button", { name: "Cumul : non, poste « Secours » non cumulable avec un autre créneau" })
  await cumul.click()
  await page.getByRole("checkbox", { name: "Poste « Secours » cumulable avec un autre créneau" }).check()
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click()
  const cumulOn = page.getByRole("button", { name: "Cumul : oui, poste « Secours » cumulable avec un autre créneau" })
  await expect(cumulOn).toBeVisible()
  await expect(cumulOn).toBeFocused()

  // The volunteer picks « Buvette », then « Secours » stays selectable, « Accueil » does not.
  await page.context().clearCookies()
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() })
  await page.goto(`/${event.slug}?org=default`)
  const buvette = page.getByRole("button", { name: /, Buvette : sélectionner/ })
  await waitForHydration(buvette)
  await buvette.click()
  await expect(page.getByRole("button", { name: /, Accueil : chevauche un créneau déjà choisi/ })).toBeVisible()
  const secours = page.getByRole("button", { name: /, Secours : sélectionner/ })
  await expect(secours).not.toHaveAttribute("aria-disabled", "true")
  await secours.click()
  await expect(page.getByRole("button", { name: /, Secours : désélectionner/ })).toBeVisible()

  await page.getByRole("button", { name: /^Continuer/ }).click()
  await expect(page.getByText("c'est possible, l'un des deux postes se cumule avec un autre créneau").first()).toBeVisible()
  await expect(page.getByText("deux de tes créneaux se chevauchent")).toHaveCount(0)
  // Parallel time counted once in the recap's total (#986, part 2): 8 h, not 12 h.
  await expect(page.getByText("2 créneaux, 8 h au total").first()).toBeVisible()
  await page.getByLabel("Prénom *", { exact: true }).fill("E2E")
  await page.getByLabel("Nom *", { exact: true }).fill(`Cumul${stamp}`)
  await page.getByLabel("Email *", { exact: true }).fill(`e2e-cumul-ui-${stamp}@example.com`)
  await page.getByRole("button", { name: "convention des bénévoles" }).click()
  await page.getByRole("button", { name: "J'ai lu et j'accepte" }).click()
  await page.getByLabel(/J.accepte que l.association/).check()
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click()
  await expect(page).toHaveURL(new RegExp(`/${event.slug}/success`))

  // The server agrees, and keeps refusing an ordinary overlap.
  expect((await signUp([id("Buvette"), id("Secours")])).ok()).toBeTruthy()
  const refused = await signUp([id("Buvette"), id("Accueil")])
  expect(refused.status()).toBe(400)
  expect((await refused.json()).error).toContain("se chevauchent")
})
