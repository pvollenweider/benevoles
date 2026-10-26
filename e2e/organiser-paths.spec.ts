import { test, expect, type Page } from "@playwright/test"
import { waitForHydration } from "./helpers/hydration"

/**
 * Shorter organiser paths (#1098): login lands on the dashboard, whose fill-rate rows open their
 * event and whose « L'archiver » archives in place; the overview of a published event links to its
 * invitations, so does the members page; the Messages page links to the message templates.
 */

const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

async function publishedEvent(page: Page, title: string, day: string): Promise<string> {
  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title, startDate: day, endDate: day, publicStatus: "draft" })
  await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: day, startTime: "18:00", endTime: "20:00", capacity: 2 })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()
  return event.id
}

test("dashboard landing, archive in place, invite and templates links", async ({ page }) => {
  test.setTimeout(120_000) // dev server compiles each page on first visit
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/dashboard$/)

  const stamp = Date.now()
  const endedTitle = `E2E terminé ${stamp}`
  const upcomingTitle = `E2E à venir ${stamp}`
  const endedId = await publishedEvent(page, endedTitle, daysAgo(5))
  // Far ahead: first of the dashboard's rows, sorted by start date, latest first.
  const upcomingId = await publishedEvent(page, upcomingTitle, "2038-06-12")

  // « L'archiver »: the confirmation in place, then the item is gone and the list's heading has the focus.
  await page.goto("/admin/dashboard")
  const attention = page.getByRole("region", { name: "Ce qui demande votre attention" })
  const item = attention.getByRole("listitem").filter({ hasText: endedTitle })
  const archive = item.getByRole("button", { name: `L'archiver : ${endedTitle}` })
  await waitForHydration(archive)
  await archive.click()
  const dialog = page.getByRole("alertdialog", { name: `Archiver « ${endedTitle} » ?` })
  await expect(dialog.getByRole("button", { name: "Confirmer" })).toBeFocused()
  await dialog.getByRole("button", { name: "Confirmer" }).click()
  await expect(attention.getByRole("listitem").filter({ hasText: endedTitle })).toHaveCount(0)
  await expect(page.getByRole("heading", { level: 2, name: "Ce qui demande votre attention" })).toBeFocused()
  const archived = await (await page.request.get(`/api/admin/events/${endedId}`)).json()
  expect(archived.publicStatus).toBe("archived")

  // A fill-rate row opens its event.
  await page.getByRole("link", { name: upcomingTitle, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${upcomingId}$`))

  // The overview of a published event: one link to its invitations.
  await page.getByRole("region", { name: "Prochaines étapes" }).getByRole("link", { name: "inviter des membres" }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/events/${upcomingId}/invitations$`))

  // The members page: « Inviter à un événement », a link when one event is open, a list otherwise.
  await page.goto("/admin/members")
  const menu = page.getByRole("button", { name: "Inviter à un événement" })
  const single = page.getByRole("link", { name: `Inviter à « ${upcomingTitle} »` })
  await expect(menu.or(single)).toBeVisible()
  if (await menu.isVisible()) {
    await waitForHydration(menu)
    await menu.click()
    await page.getByRole("link", { name: new RegExp(upcomingTitle) }).click()
  } else {
    await single.click()
  }
  await expect(page).toHaveURL(new RegExp(`/admin/events/${upcomingId}/invitations$`))

  // Messages: the templates are one link away.
  await page.goto(`/admin/events/${upcomingId}/message`)
  await expect(page.getByRole("link", { name: "gérer les modèles de messages" })).toHaveAttribute("href", "/admin/settings/message-templates")
})
