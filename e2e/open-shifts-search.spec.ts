import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { clearMailbox, getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * « Chercher des bénévoles » (#566): from an underfilled shift of « Où manque-t-il du monde ? », the
 * members are listed with their reasons, nothing ticked; a member whose shift overlaps is marked
 * and can't be ticked; the organizer ticks someone, previews, sends; the person gets one email with
 * the open shift and an invitation link, and the send shows in « Messages envoyés ».
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

async function login(page: Page) {
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)
}

test("proposes an underfilled shift to members picked by hand, one email each, recorded in the history", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now()
  await clearMailbox()
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Renfort ${stamp}`, startDate: "2030-11-01", endDate: "2030-11-01", publicStatus: "draft" })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-11-01", startTime: "22:00", endTime: "02:00", capacity: 3 })
  const accueil = await post("/api/admin/shifts", { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-11-01", startTime: "20:00", endTime: "22:15", capacity: 2 })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  const anaEmail = `e2e-renfort-ana-${stamp}@example.com`
  await post("/api/admin/members", { firstName: "Ana", lastName: `Renfort${stamp}`, email: anaEmail, tags: ["bar"], availabilityPeriods: ["evening"] })
  await post("/api/admin/members", { firstName: "Bob", lastName: `Renfort${stamp}` }) // no email
  // Olga is on « Accueil » until 22:15: 15 minutes in common with « Bar ».
  await post("/api/admin/registrations", { eventId: event.id, shiftId: accueil.id, firstName: "Olga", lastName: `Renfort${stamp}`, email: `e2e-renfort-olga-${stamp}@example.com` })

  await page.goto(`/admin/events/${event.id}/staffing`)
  await page.getByRole("link", { name: /^Chercher des bénévoles pour Bar/ }).click()
  await expect(page).toHaveURL(/\/staffing\/search\?shift=/)
  await waitForHydration(page.getByRole("heading", { level: 1, name: "Chercher des bénévoles" }))
  await expect(page.getByRole("checkbox", { name: /^Bar, / })).toBeChecked()
  await expect(page.getByRole("checkbox", { name: /^Accueil, / })).not.toBeChecked()

  await page.getByLabel("Rechercher un nom").fill(`Renfort${stamp}`)
  const ana = page.getByRole("checkbox", { name: `Ana Renfort${stamp}` })
  const olga = page.getByRole("checkbox", { name: `Olga Renfort${stamp}` })
  await expect(ana).not.toHaveAttribute("aria-disabled", "true")
  await expect(ana).not.toBeChecked()
  // Not selectable, but still reachable with Tab, its reasons with it (aria-disabled).
  await expect(olga).toHaveAttribute("aria-disabled", "true")
  // (Playwright's click waits on aria-disabled: the keyboard is what matters here.)
  await olga.focus()
  await expect(olga).toBeFocused()
  await page.keyboard.press("Space")
  await expect(olga).not.toBeChecked()
  await expect(page.getByRole("checkbox", { name: `Bob Renfort${stamp}` })).toHaveCount(0)
  const olgaRow = page.getByRole("listitem").filter({ has: olga })
  await expect(olgaRow.getByText("Chevauchement", { exact: true })).toBeVisible()
  await expect(olgaRow).toContainText("15 min en commun")
  await expect(ana).toHaveAccessibleDescription(/Disponibilité générale \(indicative\) : Soir, compatible avec l'horaire de ce créneau/)
  await expect(ana).toHaveAccessibleDescription(/Pas encore invité/)
  await expect(page.getByText(/Non proposés : .*sans email/)).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])

  // Nothing ticked: the preview doesn't open.
  const previewButton = page.getByRole("button", { name: "Voir l'aperçu et envoyer" })
  await expect(previewButton).toHaveAttribute("aria-disabled", "true")
  await ana.check()
  await page.getByLabel("Un mot pour accompagner (facultatif)").fill("On compte sur toi !")
  await previewButton.click()
  const dialog = page.getByRole("dialog", { name: "Aperçu de l'email" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("L'email part à 1 personne")
  await expect(dialog).toContainText("1 invitation sera créée")
  expect.soft(await seriousViolations(page)).toEqual([])
  await dialog.getByRole("button", { name: "Envoyer à 1 personne" }).click()

  const done = page.getByRole("heading", { name: "Email envoyé à 1 personne" })
  await expect(done).toBeVisible()
  await expect(done).toBeFocused()

  const mail = await waitForMessage(`to:"${anaEmail}"`)
  const text = await getMessageText(mail.ID)
  expect(text).toContain("On compte sur toi !")
  expect(text).toMatch(/- Bar : \S+ 1 novembre, de 22:00 à 02:00 le lendemain, 3 places libres/)
  expect(text).toMatch(/T'inscrire : https?:\/\/\S*[?&]token=\S+/)
  expect(text).not.toContain("Accueil")

  // The send is in « Messages envoyés » (#467), and Ana now has an invitation to the event.
  await page.goto(`/admin/events/${event.id}/message`)
  await expect(page.getByRole("heading", { level: 3, name: "On cherche encore du monde" })).toBeVisible()
  await expect(page.getByText("les membres choisis pour 1 créneau à compléter, 1 personne")).toBeVisible()
  await page.goto(`/admin/events/${event.id}/invitations`)
  await expect(page.getByText(`Renfort${stamp}`).first()).toBeVisible()
})
