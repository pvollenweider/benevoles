// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { recordAttendanceActions } from "./record-attendance-actions"
import { verifyAttendanceTransition } from "./attendance-capture-checks"
import { showDownloadedCsv } from "./show-downloaded-csv"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

export async function recordAttendance(options: { page: Page; base: string; eventId: string; directory: string; title: string; personPrefix?: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, title, scene, tap, settle } = options
  const personPrefix = options.personPrefix ?? "video-attendance-person-"
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated video DB required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const registrationsUrl = `${base}/admin/events/${eventId}/registrations`
  const go = async (url = registrationsUrl) => { await page.goto(url); await settle(page) }
  const snapshot = () => db.registration.findMany({ where: { eventId }, select: { id: true, status: true, checkedInAt: true } })
  try {
    const shift = await db.shift.findFirstOrThrow({ where: { eventId, roleName: "Accueil" } })
    await scene("welcome", async at => {
      await page.screencast.showChapter(title, { duration: 2400 })
      await at(0.12); await go()
      const post = page.getByLabel("Filtrer par poste", { exact: true })
      await tap(page, post); await post.selectOption("Accueil")
      await at(0.40)
      await tap(page, page.getByRole("combobox", { name: "Filtrer par créneau", exact: true }))
      await tap(page, page.getByRole("option").filter({ hasText: "Accueil du matin" }))
      if (await page.locator("tbody tr").count() !== 6) throw new Error("Wrong filtered morning list")
      if (!(await db.shift.findUniqueOrThrow({ where: { id: shift.id } }))) throw new Error("Missing morning shift")
    })
    await recordAttendanceActions(options)
    await scene("limits", async at => {
      await at(0.10); await go(`${base}/admin/members?q=video.attendance.2%40example.org`)
      const member = page.getByRole("row").filter({ hasText: "video.attendance.2@example.org" })
      if (await member.count() !== 1) throw new Error("Member fixture ambiguous")
      await page.getByRole("columnheader", { name: /Heures planifiées/ }).scrollIntoViewIfNeeded()
      if (!(await member.innerText()).includes("4h")) throw new Error("Expected four planned hours, not attested hours")
      await at(0.53); await tap(page, member.getByRole("link", { name: /^Activité/ }))
      await page.getByRole("heading", { name: "Activité de Léa Exemple", exact: true }).waitFor()
      await page.getByText(/présence|présent|point/i).last().scrollIntoViewIfNeeded()
    })
    let cancelledCheckIn = ""
    let cancelledId = ""
    await scene("cancelled", async at => {
      await at(0.08); await go()
      const sarah = await db.registration.findFirstOrThrow({ where: { eventId, volunteerId: `${personPrefix}4` }, include: { shift: true } })
      cancelledId = sarah.id
      const before = await snapshot()
      await tap(page, page.getByRole("row").filter({ hasText: "video.attendance.4@example.org" }).getByRole("checkbox"))
      const pointed = page.waitForResponse(r => r.url().endsWith("/registrations/bulk") && r.request().method() === "POST" && r.request().postDataJSON().action === "check_in")
      await tap(page, page.getByRole("button", { name: "Marquer présent (1)", exact: true }))
      if (!(await pointed).ok()) throw new Error("Sarah check-in failed")
      verifyAttendanceTransition(before, await snapshot(), [sarah.id], true)
      cancelledCheckIn = (await db.registration.findUniqueOrThrow({ where: { id: sarah.id } })).checkedInAt!.toISOString()
      await at(0.20); await go(`${base}/admin/events/${eventId}/shifts`)
      await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
      await tap(page, page.getByRole("row").filter({ hasText: sarah.shift.label }).getByRole("button", { name: /^Supprimer le créneau / }))
      const dialog = page.getByRole("alertdialog")
      await dialog.waitFor(); await at(0.32)
      const cancelled = page.waitForResponse(r => r.url().endsWith(`/shifts/${sarah.shiftId}`) && r.request().method() === "DELETE")
      await tap(page, dialog.getByRole("button", { name: /^Supprimer/ }))
      if (!(await cancelled).ok()) throw new Error("Shift cancellation failed")
      const after = await db.registration.findUniqueOrThrow({ where: { id: sarah.id }, include: { shift: true } })
      if (after.status !== "cancelled" || after.shift.status !== "cancelled" || after.checkedInAt?.toISOString() !== cancelledCheckIn) throw new Error("Previously recorded arrival was not preserved")
      await at(0.39); await go()
      if (await page.getByRole("row").filter({ hasText: "video.attendance.4@example.org" }).count()) throw new Error("Cancelled registration remains in active list")
      await at(0.48)
      await mkdir(path.join(directory, "documents"), { recursive: true })
      const downloaded = page.waitForEvent("download")
      await tap(page, page.getByRole("link", { name: /Exporter les présences/ }))
      const file = path.join(directory, "documents", "after-cancellation.csv")
      await (await downloaded).saveAs(file)
      const csv = await showDownloadedCsv(page, file)
      if (csv.rows.length !== 5 || csv.rows.some(row => row[csv.headers.indexOf("Email")] === "video.attendance.4@example.org")) throw new Error("Sarah's exclusion not reflected by downloaded CSV")
    })
    await go()
    await scene("export", async at => {
      await at(0.03)
      await mkdir(path.join(directory, "documents"), { recursive: true })
      const ready = page.waitForEvent("download")
      await tap(page, page.getByRole("link", { name: /Exporter les présences/ }))
      const file = path.join(directory, "documents", "attendance.csv")
      await (await ready).saveAs(file)
      await at(0.18)
      const csv = await showDownloadedCsv(page, file)
      const email = csv.headers.indexOf("Email"), present = csv.headers.indexOf("Présent"), time = csv.headers.indexOf("Pointé le")
      const active = await db.registration.findMany({ where: { eventId, status: "active" } })
      if (csv.rows.length !== active.length || active.length !== 5 || csv.people !== 4) throw new Error("Wrong active export scope")
      if (csv.rows.some(row => /video\.attendance\.[456]@example\.org/.test(row[email]))) throw new Error("Cancelled/request/waitlist person leaked into active export")
      if (csv.rows.filter(row => row[time]).length !== 3 || csv.rows.filter(row => !row[time]).length !== 2) throw new Error("Export differs from real pointages")
      const marked = csv.rows.find(row => row[email] === "video.attendance.0@example.org")!
      const absent = csv.rows.find(row => row[email] === "video.attendance.3@example.org")!
      if (!marked[present] || marked[present] === absent[present]) throw new Error("Presence column does not distinguish arrivals")
      await at(0.28); await page.locator(".scroll").evaluate(el => { el.scrollLeft = el.scrollWidth })
      await at(0.66)
      await page.getByLabel("Lecture d’une personne dans le fichier :", { exact: true }).selectOption("video.attendance.2@example.org")
      if (await page.locator("tbody tr:visible").count() !== 2) throw new Error("Léa's two export rows missing")
      // The concluding sentence introduces this screen now, not only in the
      // following chapter. Show the genuine dedicated Jour J route in time.
      if (base === "http://localhost:43108") {
        await at(0.82)
        await page.setViewportSize({ width: 390, height: 844 })
        await go(`${base}/admin/events/video-dayof-event-live/day-of`)
        await page.getByRole("heading", { name: "Jour J", exact: true }).waitFor()
      }
      await writeFile(path.join(directory, "attendance-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), audiovisualValidation: false, activeRows: 5, people: 4, presentRows: 3, absentRows: 2, cancellation: { registrationId: cancelledId, retainedCheckIn: cancelledCheckIn, excludedFromActiveExport: true }, noWorkedHoursCalculated: true }, null, 2))
    })
  } finally { await db.$disconnect() }
}
