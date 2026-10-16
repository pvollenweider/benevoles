import { test, expect, type Page } from "@playwright/test"
import { Client } from "pg"
import { seriousViolations } from "./helpers/axe"
import { waitForHydration } from "./helpers/hydration"
import { clearMailbox, getMessageText, waitForMessage } from "./helpers/mailpit"

/**
 * « Programmer l'envoi » (#1019): the organiser schedules a message from Communication with a date
 * and time, sees it under « Messages programmés », cancels it; another one, once due, is sent by
 * the outbox cron (invoked here), lands in the volunteer's inbox and moves to « Messages envoyés ».
 * The due time is moved into the past directly in the DB (raw `pg`, like addresses-to-verify.spec.ts):
 * waiting for a real clock time is not something a suite can do.
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

/** Tomorrow's date (YYYY-MM-DD) in Europe/Zurich, the seeded organisation's zone. */
function tomorrow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 24 * 3600 * 1000))
}

async function makeDue(id: string) {
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  try {
    await db.query(`UPDATE "ScheduledMessage" SET "scheduledFor" = now() - interval '1 minute' WHERE id = $1`, [id])
  } finally {
    await db.end()
  }
}

test("schedules a message, lists it, cancels it; a due one is sent by the cron and listed as sent", async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now()
  await clearMailbox()
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Programmé ${stamp}`, startDate: "2030-11-01", endDate: "2030-11-01", publicStatus: "draft" })
  const shift = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-11-01", startTime: "18:00", endTime: "20:00", capacity: 3 })
  const email = `e2e-sched-${stamp}@example.com`
  await post("/api/admin/registrations", { eventId: event.id, shiftId: shift.id, firstName: "Zoé", lastName: `Prog${stamp}`, email })

  // 1. Schedule from the form.
  await page.goto(`/admin/events/${event.id}/message`)
  await expect(page.getByText("1 personne recevra ce message.")).toBeVisible()
  const later = page.getByRole("radio", { name: "Programmer l'envoi" })
  await waitForHydration(later)
  await page.getByLabel("Objet *").fill("Infos parking")
  await page.getByLabel("Message *").fill("Bonjour {prénom}, entrée par la rue Basse.")
  await later.check()
  await expect(page.getByText("1 personne aujourd'hui ; le nombre est recalculé au moment de l'envoi.")).toBeVisible()
  // A past day is refused on the field.
  await page.getByLabel("Date d'envoi *").fill("2020-01-01")
  await page.getByLabel(/^Heure d'envoi/).fill("18:00")
  await page.getByRole("button", { name: "Voir l'aperçu et programmer" }).click()
  await expect(page.getByLabel("Date d'envoi *")).toHaveAttribute("aria-invalid", "true")
  await expect(page.getByLabel("Date d'envoi *")).toBeFocused()

  await page.getByLabel("Date d'envoi *").fill(tomorrow())
  await page.getByRole("button", { name: "Voir l'aperçu et programmer" }).click()
  const preview = page.getByRole("dialog", { name: "Aperçu de l'email" })
  await expect(preview).toContainText(/Programmer l'email pour le .+ à 18:00 \(Europe\/Zurich\), à 1 personne/)
  expect.soft(await seriousViolations(page)).toEqual([])
  await preview.getByRole("button", { name: "Programmer pour 1 personne" }).click()
  const confirm = page.getByRole("dialog", { name: "Confirmer la programmation" })
  await expect(confirm).toContainText("recalculé au moment de l'envoi")
  await confirm.getByRole("button", { name: "Confirmer la programmation" }).click()
  const done = page.getByRole("heading", { name: /^Message programmé pour le .+ à 18:00 \(Europe\/Zurich\)$/ })
  await expect(done).toBeFocused()

  // 2. Listed under « Messages programmés », then cancelled.
  const item = page.getByRole("article", { name: "Infos parking" })
  await expect(item).toContainText("Programmé, pas encore parti")
  expect.soft(await seriousViolations(page)).toEqual([])
  await item.getByRole("button", { name: /^Annuler l'envoi/ }).click()
  const dialog = page.getByRole("alertdialog", { name: "Annuler cet envoi programmé ?" })
  await expect(dialog.getByRole("button", { name: "Garder l'envoi" })).toBeFocused()
  await dialog.getByRole("button", { name: "Annuler l'envoi" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("status").filter({ hasText: "Envoi programmé de « Infos parking » annulé." })).toBeVisible()
  await expect(item).toContainText(/Annulé le .+, par /)
  await expect(item.getByRole("button", { name: /^Annuler l'envoi/ })).toHaveCount(0)

  // 3. Another one, made due, goes with the next cron run, once.
  const scheduled = await post(`/api/admin/events/${event.id}/scheduled-messages`, {
    audience: { kind: "event" }, subject: "Dernières infos", message: "À demain {prénom} !", date: tomorrow(), time: "09:00",
  })
  await makeDue(scheduled.id)
  const cronHeaders = process.env.CRON_SECRET ? { authorization: `Bearer ${process.env.CRON_SECRET}` } : undefined
  const run = await page.request.post("/api/cron/outbox", { headers: cronHeaders })
  expect(run.ok(), await run.text()).toBeTruthy()
  expect((await run.json()).scheduled.sent).toBeGreaterThanOrEqual(1)
  const mail = await waitForMessage(`to:"${email}" subject:"Dernières infos"`)
  expect(await getMessageText(mail.ID)).toContain("À demain Zoé !")
  const again = await page.request.post("/api/cron/outbox", { headers: cronHeaders })
  expect((await again.json()).scheduled.sent).toBe(0)

  await page.goto(`/admin/events/${event.id}/message`)
  const sent = page.getByRole("article", { name: "Dernières infos" })
  await expect(sent).toContainText("Programmépour le")
  await expect(page.getByRole("region", { name: "Messages envoyés" }).getByRole("article", { name: "Dernières infos" })).toBeVisible()
})
