import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * « Rétablir » (#809): a place removed by mistake comes back from « Annulations récentes », with
 * a new personal link when asked; once the spot is taken, the row says why instead.
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

/** An event with one one-place shift, one person registered then removed by the organiser. */
async function removedRegistration(page: Page, stamp: number) {
  const event: { id: string } = await (await page.request.post("/api/admin/events", {
    data: { title: `E2E Rétablir ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" },
  })).json()
  const shift: { id: string } = await (await page.request.post("/api/admin/shifts", {
    data: { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 1 },
  })).json()
  const email = `e2e-restore-${stamp}@example.com`
  const reg: { id: string } = await (await page.request.post("/api/admin/registrations", {
    data: { eventId: event.id, shiftId: shift.id, firstName: "Rétablie", lastName: `E2E${stamp}`, email },
  })).json()
  expect((await page.request.delete(`/api/admin/registrations/${reg.id}`)).ok()).toBe(true)
  return { event, shift, email, name: `Rétablie E2E${stamp}` }
}

test("restores a removed place with a new personal link", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await login(page)
  const stamp = Date.now()
  const { event, email, name } = await removedRegistration(page, stamp)

  await page.goto(`/admin/events/${event.id}/registrations#annulations`)
  const section = page.getByRole("region", { name: "Annulations récentes" })
  await expect(section).toContainText(name)
  await expect(section).toContainText("Annulée par l'organisation")

  await section.getByRole("button", { name: `Rétablir l'inscription de ${name}, Bar, mardi 1 octobre, de 10h à 12h` }).click()
  const dialog = page.getByRole("dialog", { name: `Rétablir l'inscription de ${name} ?` })
  await expect(dialog).toBeVisible()
  expect.soft(await seriousViolations(page)).toEqual([])
  await dialog.getByRole("checkbox", { name: "Le lien a été utilisé par quelqu'un d'autre : envoyer un nouveau lien" }).check()
  await dialog.getByRole("button", { name: "Rétablir" }).click()

  await expect(dialog).toBeHidden()
  await expect(section.getByRole("heading", { name: "Annulations récentes" })).toBeFocused()
  await expect(section.getByRole("status")).toHaveText(`Inscription de ${name} rétablie, avec un nouveau lien personnel.`)
  await expect(section.getByRole("button", { name: /Rétablir l'inscription/ })).toHaveCount(0)

  const message = await waitForMessage(`to:${email} subject:"Inscription rétablie"`)
  expect(await getMessageText(message.ID)).toContain("Ton lien personnel a été renouvelé : l'ancien ne fonctionne plus.")
})

test("says why when the spot was taken back", async ({ page }) => {
  test.setTimeout(90_000) // dev server compiles each page on first visit
  await login(page)
  const stamp = Date.now()
  const { event, shift, name } = await removedRegistration(page, stamp)
  await page.request.post("/api/admin/registrations", {
    data: { eventId: event.id, shiftId: shift.id, firstName: "Autre", lastName: `E2E${stamp}`, email: `e2e-restore-other-${stamp}@example.com` },
  })

  await page.goto(`/admin/events/${event.id}/registrations`)
  const section = page.getByRole("region", { name: "Annulations récentes" })
  await expect(section).toContainText(name)
  await expect(section).toContainText("Complet : la place a été reprise.")
  await expect(section.getByRole("button", { name: /Rétablir/ })).toHaveCount(0)
})
