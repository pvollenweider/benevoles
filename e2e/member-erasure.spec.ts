import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * Erasure of a member's personal data (#516): a member with history (a confirmed, checked-in
 * registration) is erased from their page; the record becomes « Bénévole effacé », the
 * registration stays on the event, and the email is gone from the members list.
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

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

test("erase a member with history: anonymised in place, the registration kept, the address gone", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }

  const stamp = Date.now()
  const lastName = `Efface${stamp}`
  const email = `e2e-erase-${stamp}@example.com`
  const day = daysAgo(20)
  const member = await post("/api/admin/members", { firstName: "Zoé", lastName, email, phone: "0791234567" })
  const event = await post("/api/admin/events", { title: `E2E effacement ${stamp}`, startDate: day, endDate: day, publicStatus: "draft" })
  const shift = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: day, startTime: "18:00", endTime: "20:00", capacity: 2 })
  const reg = await post("/api/admin/registrations", { eventId: event.id, shiftId: shift.id, firstName: "Zoé", lastName, email, comment: `mot-${stamp}` })
  await post(`/api/admin/events/${event.id}/registrations/bulk`, { action: "check_in", registrationIds: [reg.id] })

  await page.goto(`/admin/members/${member.id}`)
  await expect(page.getByRole("heading", { level: 1, name: `Activité de Zoé ${lastName}` })).toBeVisible()

  const eraseButton = page.getByRole("button", { name: `Effacer les données personnelles de Zoé ${lastName}` })
  await waitForHydration(eraseButton)
  await eraseButton.click()
  const dialog = page.getByRole("alertdialog", { name: `Effacer les données personnelles de Zoé ${lastName} ?` })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText("irréversible")
  await expect(dialog).toContainText("Conservé :")
  await expect(dialog).toContainText("1 inscription (créneau, statut, présence), sans identité")
  // Cancel is focused first (ConfirmActionModal).
  await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused()

  // Not without the word.
  await dialog.getByRole("button", { name: "Effacer les données", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("ne correspond pas")

  await dialog.getByLabel("Pour confirmer, saisissez « effacer »").fill("effacer")
  await dialog.getByRole("button", { name: "Effacer les données", exact: true }).click()

  // The notice replaces the button and takes the focus; the page refreshes around it.
  const notice = page.getByText("Les données personnelles de cette fiche ont été effacées.", { exact: false })
  await expect(notice).toBeVisible()
  await expect(notice).toBeFocused()
  await expect(page.getByRole("heading", { level: 1, name: "Activité de Bénévole effacé" })).toBeVisible()
  await expect(page.getByRole("alertdialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Effacer les données personnelles/ })).toHaveCount(0)

  // The registration stays on the event, without identity.
  await page.goto(`/admin/events/${event.id}/registrations`)
  await expect(page.getByText("Bénévole effacé").first()).toBeVisible()
  await expect(page.getByText(`mot-${stamp}`)).toHaveCount(0)
  await expect(page.getByText(email)).toHaveCount(0)

  // Editing the erased record is refused: the data can't be typed back in.
  const patch = await page.request.patch(`/api/admin/members/${member.id}`, { data: { firstName: "Zoé" } })
  expect(patch.status()).toBe(409)

  // A second erasure changes nothing (idempotent).
  const again = await page.request.post(`/api/admin/members/${member.id}/erase`)
  expect(await again.json()).toMatchObject({ success: true, alreadyErased: true })
})
