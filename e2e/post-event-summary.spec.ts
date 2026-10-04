import { test, expect, type Page } from "@playwright/test"
import fs from "node:fs"
import { waitForHydration } from "./helpers/hydration"

/**
 * Post-event summary and hours by volunteer for a period (#557): the « Rapports » page shows the
 * event summary (distinct volunteers, presences, hours, fill rate) once check-ins are recorded;
 * the members list shows the renamed/added hours columns and « Dernière participation », sortable;
 * the « Heures par bénévole » CSV export has the expected header row.
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

// Past dates, well inside the default 12-month export period, whatever day the suite runs.
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

test("event summary on Rapports, members list columns, and the hours-by-volunteer CSV", async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)

  const post = async (url: string, body: unknown) => {
    const res = await page.request.post(url, { data: body })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }

  const stamp = Date.now()
  const olderDate = daysAgo(60)
  const recentDate = daysAgo(10)

  // Member A: one confirmed, checked-in shift on an older event (first-time, attested).
  const emailA = `e2e-summary-a-${stamp}@example.com`
  await post("/api/admin/members", { firstName: "E2E", lastName: `SummaryA${stamp}`, email: emailA })
  const eventOld = await post("/api/admin/events", { title: `E2E résumé ancien ${stamp}`, startDate: olderDate, endDate: olderDate, publicStatus: "draft" })
  const shiftOld = await post("/api/admin/shifts", { eventId: eventOld.id, roleName: "Bar", label: "Bar", date: olderDate, startTime: "18:00", endTime: "20:00", capacity: 2 })
  const regA = await post("/api/admin/registrations", { eventId: eventOld.id, shiftId: shiftOld.id, firstName: "E2E", lastName: `SummaryA${stamp}`, email: emailA })
  await post(`/api/admin/events/${eventOld.id}/registrations/bulk`, { action: "check_in", registrationIds: [regA.id] })

  // Member B: one confirmed, non-checked-in shift on a more recent event (returning for that event, not attested).
  const emailB = `e2e-summary-b-${stamp}@example.com`
  await post("/api/admin/members", { firstName: "E2E", lastName: `SummaryB${stamp}`, email: emailB })
  const eventRecent = await post("/api/admin/events", { title: `E2E résumé récent ${stamp}`, startDate: recentDate, endDate: recentDate, publicStatus: "draft" })
  const shiftRecent1 = await post("/api/admin/shifts", { eventId: eventRecent.id, roleName: "Bar", label: "Bar", date: recentDate, startTime: "18:00", endTime: "20:00", capacity: 2 })
  const shiftRecent2 = await post("/api/admin/shifts", { eventId: eventRecent.id, roleName: "Caisse", label: "Caisse", date: recentDate, startTime: "18:00", endTime: "20:00", capacity: 1 })
  await post("/api/admin/registrations", { eventId: eventRecent.id, shiftId: shiftRecent1.id, firstName: "E2E", lastName: `SummaryB${stamp}`, email: emailB })

  // Member A also takes a shift on the recent event: returning volunteer for this one.
  await post("/api/admin/registrations", { eventId: eventRecent.id, shiftId: shiftRecent2.id, firstName: "E2E", lastName: `SummaryA${stamp}`, email: emailA })

  // ── Rapports: the event summary ──────────────────────────────────────────
  await page.goto(`/admin/events/${eventRecent.id}/print`)
  await expect(page.getByRole("heading", { level: 1, name: "Rapports" })).toBeVisible()
  const summary = page.getByRole("region", { name: "Résumé de l'événement" })
  await expect(summary.getByRole("heading", { level: 2 })).toHaveText("Résumé de l'événement")
  await expect(summary).toContainText("2 bénévoles distincts")
  await expect(summary).toContainText("1 pour la première fois")
  await expect(summary).toContainText("1 de retour")
  // Presences: neither of the recent event's two confirmed shifts has a check-in.
  await expect(summary).toContainText("0 sur 2 créneaux confirmés")
  await expect(summary).toContainText("Aucune présence n'a été saisie")
  // Fill rate: 2 places occupied out of 3 (Bar 1/2, Caisse 1/1 — full, so not in the underfilled list).
  await expect(summary).toContainText("2 places occupées sur 3")
  await expect(summary).toContainText("1 sur 2")
  await expect(summary.getByText("Créneaux restés incomplets")).toContainText("1")

  // ── Members list: the renamed/added columns ──────────────────────────────
  await page.goto("/admin/members")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  const table = page.getByRole("table", { name: "Liste des membres" })
  await expect(table.getByRole("columnheader", { name: "Heures planifiées" })).toBeVisible()
  await expect(table.getByRole("columnheader", { name: "Heures attestées" })).toBeVisible()
  const lastParticipationHeader = table.getByRole("columnheader", { name: "Dernière participation" })
  await expect(lastParticipationHeader).toBeVisible()

  const rowA = table.getByRole("row", { name: new RegExp(`SummaryA${stamp}`) })
  const rowB = table.getByRole("row", { name: new RegExp(`SummaryB${stamp}`) })
  await expect(rowA).toContainText("Présence le")
  await expect(rowB).toContainText("Aucune présence saisie")

  // Sort by « Dernière participation »: A's most recent shift is the recent event too (shared
  // date), B's only shift is also the recent event — sort ascending by last shift date, then
  // click once more for descending, exercising the sortable header (aria-sort, #557).
  const sortButton = lastParticipationHeader.getByRole("button")
  await waitForHydration(sortButton)
  await expect(lastParticipationHeader).toHaveAttribute("aria-sort", "none")
  await sortButton.click()
  await expect(lastParticipationHeader).toHaveAttribute("aria-sort", "ascending")
  await sortButton.click()
  await expect(lastParticipationHeader).toHaveAttribute("aria-sort", "descending")

  // ── Hours by volunteer (CSV) ──────────────────────────────────────────────
  await page.getByText("Heures par bénévole, pour une période (CSV)").click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger (CSV)" }).click(),
  ])
  const path = await download.path()
  expect(path).toBeTruthy()
  const content = fs.readFileSync(path!, "utf-8")
  const header = content.split("\r\n")[0]
  expect(header).toContain("Prénom;Nom;Événements;Créneaux;Heures planifiées;Heures attestées")
  expect(content).toContain(`SummaryA${stamp}`)
})
