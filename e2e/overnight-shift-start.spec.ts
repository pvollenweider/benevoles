import { test, expect, type Page } from "@playwright/test"
import { createPublicEvent, publicSignUp, randomIp } from "./helpers/public-signup"

/**
 * Changing the start of an overnight shift keeps its end (#1024): a 22:00–02:00 shift moved to
 * 23:00 in the shift editor still ends at 02:00 the next morning, and so does the volunteer's
 * calendar file. The end used to become 00:00, midnight of the start day.
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

/** DTSTART and DTEND of the only event of an .ics file, as dates. */
function icsTimes(ics: string): { start: Date; end: Date } {
  const at = (key: string) => {
    const m = ics.match(new RegExp(`^${key}:(\\d{4})(\\d{2})(\\d{2})T(\\d{2})(\\d{2})(\\d{2})Z`, "m"))
    expect(m, `${key} in the calendar file`).toBeTruthy()
    const [, y, mo, d, h, mi, s] = m!
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
  }
  return { start: at("DTSTART"), end: at("DTEND") }
}

test("editing the start of a 22:00–02:00 shift keeps its end at 02:00, in the calendar file too", async ({ page, browser }) => {
  const event = await createPublicEvent(browser, `E2E Overnight ${Date.now()}`, [{ label: "Veille", startTime: "22:00", endTime: "02:00" }])
  const token = await publicSignUp(page, event, [event.shifts[0].id])

  await login(page)
  await page.goto(`/admin/events/${event.eventId}/shifts`)
  await page.getByRole("button", { name: "Liste", exact: true }).click()
  await page.getByRole("button", { name: /^Modifier le créneau Veille/ }).click()
  const editor = page.getByRole("group", { name: "Modifier le créneau" })
  const start = editor.getByRole("textbox", { name: "Début", exact: true })
  const end = editor.getByRole("textbox", { name: "Fin", exact: true })
  await expect(end).toHaveValue("02:00")

  // Typed key by key, as a person does: each keystroke recomputes the end.
  await start.fill("")
  await start.pressSequentially("23:00")
  await start.blur()
  await expect(end).toHaveValue("02:00")
  await editor.getByRole("button", { name: "Enregistrer", exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByRole("status").filter({ hasText: "Créneau modifié" })).toContainText(/de 23h à 2h/)

  // Saved as such: the editor opened again after a reload shows 23:00–02:00.
  await page.reload()
  await page.getByRole("button", { name: "Liste", exact: true }).click()
  await page.getByRole("button", { name: /^Modifier le créneau Veille/ }).click()
  await expect(start).toHaveValue("23:00")
  await expect(end).toHaveValue("02:00")

  const ics = await page.request.get(`/api/public/registrations/${token}/calendar`, { headers: { "x-forwarded-for": randomIp() } })
  expect(ics.ok(), await ics.text()).toBeTruthy()
  const { start: dtStart, end: dtEnd } = icsTimes(await ics.text())
  // Three hours, ending the next morning: not a shift cut at midnight of its first day.
  expect(dtEnd.getTime() - dtStart.getTime()).toBe(3 * 60 * 60 * 1000)
})
