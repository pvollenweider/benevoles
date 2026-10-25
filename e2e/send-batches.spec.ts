import { test, expect, type Page } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { waitForMessage } from "./helpers/mailpit"

/**
 * Bulk send history (#1101): inviting two members is one « envoi groupé », shown in the event's
 * Communication tab with its delivery, linked to its emails in « Emails envoyés », and in the
 * organisation activity log with a link back to the event. Never the recipients.
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

test("a batch of invitations is one « envoi groupé », in the Communication tab and the activity log", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now()
  await login(page)
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const title = `E2E Envoi ${stamp}`
  const event = await post("/api/admin/events", { title, startDate: "2030-11-01", endDate: "2030-11-01", publicStatus: "draft" })
  const emails = [0, 1].map((i) => `e2e-batch-${stamp}-${i}@example.com`)
  const members = await Promise.all(emails.map((email, i) => post("/api/admin/members", { firstName: "E2E", lastName: `Lot${stamp}${i}`, email })))
  expect(await post(`/api/admin/events/${event.id}/invitations`, { volunteerIds: members.map((m) => m.id) })).toMatchObject({ invitedNew: 2, emailsQueued: 2 })
  for (const email of emails) await waitForMessage(`to:"${email}"`)

  // The Communication tab: one card, what it was, to how many, what became of it.
  await page.goto(`/admin/events/${event.id}/message`)
  const section = page.getByRole("region", { name: "Envois groupés" })
  const card = section.getByRole("article", { name: /^Invitations/ })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText("2 destinataires")
  await expect(card).toContainText("2 envoyés")
  for (const email of emails) await expect(section).not.toContainText(email)
  expect.soft(await seriousViolations(page), "Communication tab with a batch").toEqual([])

  // Its emails, and only them, in « Emails envoyés ».
  await card.getByRole("link", { name: /^Voir les emails de cet envoi/ }).click()
  await expect(page).toHaveURL(/\/admin\/settings\/notifications\?envoi=[^#]+#emails-envoyes$/)
  // The list, below the settings, takes the focus.
  await expect(page.getByRole("heading", { level: 2, name: "Emails envoyés" })).toBeFocused()
  await expect(page.getByText(/^Emails de l'envoi «\u00a0Invitations\u00a0» du .+, encore dans la liste\./)).toBeVisible()
  const table = page.getByRole("region", { name: /^Emails de l'envoi/ })
  await expect(table.getByRole("row")).toHaveCount(3) // header + 2 emails
  expect.soft(await seriousViolations(page), "Emails page filtered to a batch").toEqual([])

  // The activity log: one entry, with the delivery and a link back to the event.
  await page.goto("/admin/settings/activity")
  const entry = page.getByRole("listitem").filter({ hasText: `Invitations, ${title}` })
  await expect(entry).toContainText("a lancé un envoi groupé d'emails")
  await expect(entry).toContainText("2 destinataires")
  await entry.getByRole("link", { name: /^Voir dans les messages de l'événement/ }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${event.id}/message#envois-groupes$`))
  await expect(page.getByRole("heading", { level: 2, name: "Envois groupés" })).toBeFocused()
})
