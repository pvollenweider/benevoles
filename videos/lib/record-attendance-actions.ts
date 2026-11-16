// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { pgAdapter } from "../../src/lib/prisma-adapter"
import { verifyAttendanceTransition } from "./attendance-capture-checks"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { attendanceStateOf } from "../../src/lib/attendance-state"
import type { Cue } from "./sentence-timing"

type Scene = (id: string, action: (at: Cue) => Promise<void>) => Promise<void>

/** Arrival/correction chapters. Cancellation and export are separate required chapters. */
export async function recordAttendanceActions(options: { page: Page; base: string; eventId: string; directory: string; personPrefix?: string; scene: Scene; tap: (page: Page, target: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated video DB required")
  const db = new PrismaClient({ adapter: pgAdapter(process.env.DATABASE_URL) })
  const evidence: { action: string; changedIds: string[]; unchangedStatuses: boolean; nonSelectedUnchanged: boolean }[] = []
  try {
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { registrations: { include: { volunteer: true, shift: true } } } })
    if (event.slug !== "atelier-pointage" || event.registrations.length !== 8 || event.registrations.some(r => r.checkedInAt)) throw new Error("Fresh attendance fixture required")
    const rows = event.registrations
    const find = (person: number, role = "Accueil") => {
      const row = rows.find(r => r.volunteerId === `${options.personPrefix ?? "video-attendance-person-"}${person}` && r.shift.roleName === role)
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
      await go(); await at(0.15) /* mid-sentence */; await select(0)
      await at("La marque apparaît sur son inscription"); await apply([find(0).id], true)
      const aline = page.getByRole("row").filter({ hasText: "video.attendance.0@example.org" })
      await aline.scrollIntoViewIfNeeded()
      await at("Rechargeons la page"); await page.reload(); await settle(page)
      if (!(await db.registration.findUniqueOrThrow({ where: { id: find(0).id } })).checkedInAt) throw new Error("Presence not persistent")
      await aline.scrollIntoViewIfNeeded()
      await aline.getByText("Présent", { exact: false }).waitFor()
    })
    await scene("group", async at => {
      await go(); await at(0.15) /* mid-sentence */; await select(1); await select(2)
      await at(0.38) /* mid-sentence */; await apply([find(1).id, find(2).id], true)
      if (await page.getByRole("row").filter({ hasText: "video.attendance.3@example.org" }).getByText("Présent", { exact: false }).count()) throw new Error("Absent person displayed as present")
      await at("Ne la transformez pas en"); await page.getByRole("row").filter({ hasText: "video.attendance.5@example.org" }).scrollIntoViewIfNeeded()
    })
    await scene("correction", async at => {
      await go(); await at("Sélectionnons sa ligne et annulons"); await select(2)
      await at("Sélectionnons sa ligne et annulons"); await apply([find(2).id], false)
      // The real manager clears its selection after every presence action.
      await at("Quand la bonne personne arrive"); await go(); await select(2); await apply([find(2).id], true)
    })
    await scene("multiple", async at => {
      await go(); await at("Recherchons Léa pour retrouver ses")
      const search = page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true })
      await tap(page, search); await search.pressSequentially("video.attendance.2@example.org", { delay: 65 })
      const lea = await db.registration.findMany({ where: { eventId, volunteerId: `${options.personPrefix ?? "video-attendance-person-"}2` }, include: { shift: true } })
      if (lea.length !== 2 || lea.filter(r => r.checkedInAt).length !== 1 || lea.find(r => r.shift.roleName === "Buvette")?.checkedInAt !== null) throw new Error("Presence propagated to another shift")
      if (await page.locator("tbody tr").count() !== 2) throw new Error("Léa's two registrations are not shown together")
      await page.getByRole("row").filter({ hasText: "video.attendance.2@example.org" }).last().scrollIntoViewIfNeeded()
    })
    await scene("absence-departure", async at => {
      const applyState = async (person: number, action: string, label: string, expected: string) => {
        await go(); await select(person)
        const before = await db.registration.findMany({ where: { eventId }, select: { id: true, status: true, checkedInAt: true, attendanceStatus: true } })
        const pending = page.waitForResponse(r => r.url().endsWith("/registrations/bulk") && r.request().method() === "POST" && r.request().postDataJSON().action === action)
        await tap(page, page.getByRole("button", { name: label, exact: true }))
        const response = await pending
        if (!response.ok()) throw new Error(`Attendance ${action} failed`)
        const result = await response.json()
        if (result.changedIds?.length !== 1 || result.changedIds[0] !== find(person).id) throw new Error(`Attendance ${action} changed another registration`)
        const after = await db.registration.findMany({ where: { eventId }, select: { id: true, status: true, checkedInAt: true, attendanceStatus: true } })
        for (const row of before) {
          const next = after.find(r => r.id === row.id)
          if (!next || next.status !== row.status || (row.id !== find(person).id && JSON.stringify(next) !== JSON.stringify(row))) throw new Error(`Attendance ${action} changed the selection scope`)
        }
        const persisted = await db.registration.findUniqueOrThrow({ where: { id: find(person).id } })
        if (attendanceStateOf(persisted) !== expected || persisted.status !== "active") throw new Error(`Attendance ${action} not persisted`)
        await page.getByRole("row").filter({ hasText: find(person).volunteer.email! }).scrollIntoViewIfNeeded()
      }
      await at("Sélectionnons sa ligne et choisissons Marquer absent")
      await applyState(3, "mark_absent", "Marquer absent (1)", "absent")
      await at("Annuler l'absence permet de corriger")
      await applyState(3, "undo_absent", "Annuler l'absence (1)", "expected")
      await at("Notons à nouveau son absence")
      await applyState(3, "mark_absent", "Marquer absent (1)", "absent")
      await at("Sélectionnons sa ligne présente")
      await applyState(0, "mark_left_early", "Marquer parti avant la fin (1)", "left_early")
      await at("Annuler le départ corrige")
      await applyState(0, "undo_left_early", "Annuler le départ (1)", "present")
      await at("Notons à nouveau son départ")
      await applyState(0, "mark_left_early", "Marquer parti avant la fin (1)", "left_early")
    })
    await writeFile(path.join(directory, "attendance-action-checks.json"), JSON.stringify({ scope: "four UI action chapters and persisted states only", audiovisualValidation: false, evidence }, null, 2))
  } finally { await db.$disconnect() }
}
