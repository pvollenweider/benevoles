import { test, expect, type Browser, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"
import { clearMailbox, waitForMessage, getMessageText } from "./helpers/mailpit"

/**
 * A member invited to an event can say « Je ne suis pas disponible pour cet événement » from the
 * invitation link, in two steps (link, then confirm) — never a state change on the plain page
 * load (#558). The admin invitations list then shows « Pas disponible » for that person, and the
 * « Sans réponse » filter leaves them out.
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

type Event = { id: string; slug: string }

async function createEventWithMember(browser: Browser, title: string, memberEmail: string): Promise<Event> {
  const page = await browser.newPage()
  await login(page)
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title, startDate: "2030-11-01", endDate: "2030-11-01", publicStatus: "draft" })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-11-01", startTime: "10:00", endTime: "12:00", capacity: 5 })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  const member = await post("/api/admin/members", { firstName: "E2E", lastName: `Decline${Date.now()}`, email: memberEmail })
  const invite = await page.request.post(`/api/admin/events/${event.id}/invitations`, { data: { volunteerIds: [member.id] } })
  expect(invite.ok(), await invite.text()).toBeTruthy()

  await page.close()
  return { id: event.id, slug: event.slug }
}

test("declines an invitation in two steps, then shows up as « Pas disponible » in the admin list, out of « Sans réponse »", async ({ page, browser }) => {
  test.setTimeout(120_000)
  const stamp = Date.now()
  const memberEmail = `e2e-decline-${stamp}@example.com`
  await clearMailbox()
  const event = await createEventWithMember(browser, `E2E Déclin ${stamp}`, memberEmail)

  // 1. Open the invitation link from the email.
  const mail = await waitForMessage(`to:"${memberEmail}"`)
  const text = await getMessageText(mail.ID)
  const inviteUrl = text.match(/https?:\/\/\S*[?&]token=\S+/)?.[0]
  expect(inviteUrl, "the invitation email carries the personal link").toBeTruthy()
  // Also carries the decline link (second action, #558).
  expect(text).toContain("Tu ne peux pas participer cette fois")
  const url = new URL(inviteUrl!)
  await page.goto(url.pathname + url.search)
  await waitForHydration(page.getByRole("heading", { level: 1 }))

  const declineButton = page.getByRole("button", { name: "Je ne suis pas disponible pour cet événement" })
  await expect(declineButton).toBeVisible()

  // 2. Confirmation step: opening it changes nothing yet.
  await declineButton.click()
  const dialog = page.getByRole("alertdialog", { name: "Confirmer que tu n'es pas disponible ?" })
  await expect(dialog).toBeVisible()
  await page.getByRole("button", { name: "Confirmer" }).click()

  const result = page.getByText(/Tu as indiqué ne pas être disponible pour cet événement\./)
  await expect(result).toBeVisible()
  await expect(result).toBeFocused()
  await expect(declineButton).toHaveCount(0)

  // Reloading the same link shows the acknowledgement right away, without a second POST changing anything.
  const declinedCheck = page.waitForResponse((r) => r.url().includes("/api/public/member-invite/") && r.request().method() === "GET")
  await page.goto(url.pathname + url.search)
  await waitForHydration(page.getByRole("heading", { level: 1 }))
  await declinedCheck
  await expect(page.getByText(/Tu as indiqué ne pas être disponible pour cet événement\./)).toBeVisible()

  // 3. The admin invitations list: « Pas disponible », and the « Sans réponse » filter leaves it out.
  await login(page)
  await page.goto(`/admin/events/${event.id}/invitations`)
  await expect(page.locator("table").getByText("Pas disponible", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: /Sans réponse/ }).click()
  await expect(page.getByText("Aucun invité dans ce filtre.")).toBeVisible()
})
