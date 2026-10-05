import { test, expect } from "@playwright/test"
import { seriousViolations } from "./helpers/axe"
import { randomIp } from "./helpers/public-signup"

/**
 * « Synthèse des réponses » of an event's Questions page (#686): one captioned table per question,
 * each confirmed volunteer counted once, pending ones apart; the same summary as CSV and as a
 * printable sheet.
 */
const ORG_ADMIN_EMAIL = process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost"
const ORG_ADMIN_PASSWORD = process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password"

test("counts confirmed volunteers once, pending apart, and exports the summary", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/admin/login")
  await page.getByLabel("Email").fill(ORG_ADMIN_EMAIL)
  await page.getByLabel("Mot de passe").fill(ORG_ADMIN_PASSWORD)
  await page.getByRole("button", { name: "Se connecter" }).click()
  await expect(page).toHaveURL(/\/admin\/events/)

  const stamp = Date.now()
  const post = async (url: string, body: unknown, headers?: Record<string, string>) => {
    const res = await page.request.post(url, { data: body, headers })
    expect(res.ok(), `${url}: ${res.status()} ${await res.text()}`).toBeTruthy()
    return res.json()
  }
  const event = await post("/api/admin/events", { title: `E2E Synthèse ${stamp}`, startDate: "2030-10-01", endDate: "2030-10-01", publicStatus: "draft" })
  const bar = await post("/api/admin/shifts", { eventId: event.id, roleName: "Bar", label: "Bar", date: "2030-10-01", startTime: "10:00", endTime: "12:00", capacity: 5 })
  const accueil = await post("/api/admin/shifts", { eventId: event.id, roleName: "Accueil", label: "Accueil", date: "2030-10-01", startTime: "14:00", endTime: "16:00", capacity: 5 })
  const control = await post("/api/admin/shifts", { eventId: event.id, roleName: "Contrôle", label: "Contrôle", date: "2030-10-01", startTime: "17:00", endTime: "19:00", capacity: 3, requiresApproval: true })
  const size = await post(`/api/admin/events/${event.id}/questions`, { label: "Taille de t-shirt", type: "single", options: ["S", "M", "L"] })
  const diet = await post(`/api/admin/events/${event.id}/questions`, { label: "Régime", type: "text" })
  const publish = await page.request.patch(`/api/admin/events/${event.id}`, { data: { publicStatus: "published" } })
  expect(publish.ok(), await publish.text()).toBeTruthy()

  const signUp = (who: string, shiftIds: string[], answers: Record<string, string>) =>
    post("/api/public/registrations", {
      eventId: event.id, shiftIds, firstName: "E2E", lastName: `${who}${stamp}`, email: `e2e-sum-${who.toLowerCase()}-${stamp}@example.com`, consent: true, answers,
    }, { "x-forwarded-for": randomIp() })
  // Two shifts, one t-shirt.
  await signUp("Alice", [bar.id, accueil.id], { [size.id]: "M", [diet.id]: "Végétarien" })
  await signUp("Bruno", [bar.id], { [size.id]: "M", [diet.id]: "vegetarien" })
  // Waiting for approval only: counted apart.
  await signUp("Chloe", [control.id], { [size.id]: "L" })

  await page.goto(`/admin/events/${event.id}/questions`)
  const summary = page.getByRole("region", { name: "Synthèse des réponses" })
  await expect(summary).toBeVisible()
  await expect(summary.getByText(/^État au \d{1,2} \S+ \d{4} à \d{1,2}h(\d{2})?$/)).toBeVisible()
  await expect(summary.getByText(/2 bénévoles confirmés/)).toBeVisible()

  const sizes = summary.getByRole("table", { name: "Taille de t-shirt" })
  await expect(sizes.getByRole("columnheader")).toHaveText(["Réponse", "Confirmés", "En attente"])
  await expect(sizes.getByRole("row")).toHaveText([/Réponse/, /^S\s*0\s*0$/, /^M\s*2\s*0$/, /^L\s*0\s*1$/, /^Sans réponse\s*0\s*0$/])
  const diets = summary.getByRole("table", { name: "Régime" })
  await expect(diets.getByRole("row").nth(1)).toHaveText(/^Végétarien\s*2\s*0$/)
  await expect(diets.getByRole("row").nth(2)).toHaveText(/^Sans réponse\s*0\s*1$/)
  expect(await seriousViolations(page)).toEqual([])

  const csv = await page.request.get(`/api/admin/events/${event.id}/export/answers`)
  expect(csv.ok()).toBeTruthy()
  expect(csv.headers()["content-type"]).toContain("text/csv")
  const lines = (await csv.text()).replace(/^﻿/, "").split("\r\n")
  expect(lines[0]).toBe("Question;Réponse;Confirmés;En attente")
  expect(lines).toContain("Taille de t-shirt;M;2;0")
  expect(lines).toContain("Taille de t-shirt;L;0;1")

  const sheet = await page.request.get(`/api/admin/events/${event.id}/export/sheets/answers`)
  expect(sheet.ok()).toBeTruthy()
  const html = await sheet.text()
  expect(html).toContain("<caption>Taille de t-shirt</caption>")
  expect(html).not.toContain(`Alice${stamp}`)
})
