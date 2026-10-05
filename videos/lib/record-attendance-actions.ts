// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { verifyAttendanceTransition } from "./attendance-capture-checks"
import { writeFile } from "node:fs/promises"
import path from "node:path"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>

/** Arrival/correction chapters. Cancellation and export are separate required chapters. */
export async function recordAttendanceActions(options: { page: Page; base: string; eventId: string; directory: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated video DB required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const evidence: { action: string; changedIds: string[]; unchangedStatuses: boolean; nonSelectedUnchanged: boolean }[] = []
  try {
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { registrations: { include: { volunteer: true, shift: true } } } })
    if (event.slug !== "atelier-pointage" || event.registrations.length !== 8 || event.registrations.some(r => r.checkedInAt)) throw new Error("Fresh attendance fixture required")
    const rows = event.registrations
    const find = (person: number, role = "Accueil") => {
      const row = rows.find(r => r.volunteerId === `video-attendance-person-${person}` && r.shift.roleName === role)
      if (!row) throw new Error("Attendance actor missing")
      return row
    }
    const snapshot = () => db.registration.findMany({ where: { eventId }, select: { id: true, status: true, checkedInAt: true } })
    const go = async () => { await page.goto(`${base}/admin/events/${eventId}/registrations`); await settle(page) }
    const select = async (person: number, role = "Accueil") => {
      const record = find(person, role)
      const row = page.getByRole("row").filter({ hasText: record.volunteer.email! }).filter({ hasText: role })
      if (await row.count() !== 1) throw new Error("Selection is ambiguous")
      await tap(page, row.getByRole("checkbox"))
    }
    const apply = async (ids: string[], present: boolean) => {
      const before = await snapshot()
      const action = present ? "check_in" : "undo_check_in"
      const pending = page.waitForResponse(r => r.url().endsWith(`/registrations/bulk`) && r.request().method() === "POST" && r.request().postDataJSON().action === action)
      await tap(page, page.getByRole("button", { name: present ? new RegExp(`^Marquer présents? \\(${ids.length}\\)$`) : `Annuler la présence (${ids.length})` }))
      const response = await pending
      if (!response.ok()) throw new Error("Presence request failed")
      const result = await response.json()
      const changed = verifyAttendanceTransition(before, await snapshot(), ids, present)
      if (JSON.stringify([...result.changedIds].sort()) !== JSON.stringify(changed)) throw new Error("UI result differs from persisted presence")
      evidence.push({ action, changedIds: changed, unchangedStatuses: true, nonSelectedUnchanged: true })
    }
    await scene("one", async at => {
      await go(); await at(0.15); await select(0)
      await at(0.38); await apply([find(0).id], true)
      await at(0.65); await page.reload(); await settle(page)
      if (!(await db.registration.findUniqueOrThrow({ where: { id: find(0).id } })).checkedInAt) throw new Error("Presence not persistent")
      await page.getByRole("row").filter({ hasText: "video.attendance.0@example.org" }).getByText("Présent", { exact: false }).waitFor()
    })
    await scene("group", async at => {
      await go(); await at(0.15); await select(1); await select(2)
      await at(0.38); await apply([find(1).id, find(2).id], true)
      if (await page.getByRole("row").filter({ hasText: "video.attendance.3@example.org" }).getByText("Présent", { exact: false }).count()) throw new Error("Absent person displayed as present")
      await at(0.70); await page.getByRole("row").filter({ hasText: "video.attendance.5@example.org" }).scrollIntoViewIfNeeded()
    })
    await scene("correction", async at => {
      await go(); await at(0.15); await select(2)
      await at(0.32); await apply([find(2).id], false)
      // The real manager clears its selection after every presence action.
      await at(0.66); await go(); await select(2); await apply([find(2).id], true)
    })
    await scene("multiple", async at => {
      await go(); await at(0.10)
      const search = page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true })
      await tap(page, search); await search.pressSequentially("video.attendance.2@example.org", { delay: 65 })
      const lea = await db.registration.findMany({ where: { eventId, volunteerId: "video-attendance-person-2" }, include: { shift: true } })
      if (lea.length !== 2 || lea.filter(r => r.checkedInAt).length !== 1 || lea.find(r => r.shift.roleName === "Buvette")?.checkedInAt !== null) throw new Error("Presence propagated to another shift")
      if (await page.locator("tbody tr").count() !== 2) throw new Error("Léa's two registrations are not shown together")
      await page.getByRole("row").filter({ hasText: "video.attendance.2@example.org" }).last().scrollIntoViewIfNeeded()
    })
    await writeFile(path.join(directory, "attendance-action-checks.json"), JSON.stringify({ scope: "four UI action chapters and persisted states only", audiovisualValidation: false, evidence }, null, 2))
  } finally { await db.$disconnect() }
}
