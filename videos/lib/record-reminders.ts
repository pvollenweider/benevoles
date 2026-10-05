// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Locator, Page } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { addMinutes } from "../../src/lib/gantt-utils"
import { writeFile } from "node:fs/promises"
import path from "node:path"

type Scene = (id: string, action: (at: (fraction: number) => Promise<void>) => Promise<void>) => Promise<void>
type Mail = { ID: string; To: { Address: string }[]; Subject: string }

export async function recordReminders(options: { page: Page; base: string; eventId: string; directory: string; title: string; scene: Scene; tap: (page: Page, locator: Locator) => Promise<void>; settle: (page: Page) => Promise<void> }) {
  const { page, base, eventId, directory, title, scene, tap, settle } = options
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video DB required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const eventUrl = `${base}/admin/events/${eventId}`
  const go = async (url: string) => { await page.goto(url); await settle(page) }
  const inbox = async (): Promise<Mail[]> => {
    const response = await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")
    if (!response.ok()) throw new Error("Cannot inspect actual mailbox")
    return (await response.json()).messages
  }
  const openMail = async (mails: Mail[], email: string, expected: string[]) => {
    const matches = mails.filter(m => m.To.some(t => t.Address === email))
    if (matches.length !== 1) throw new Error("Expected exactly one actual message for recipient")
    const detail = await (await page.request.get(`http://localhost:48026/api/v1/message/${matches[0].ID}`)).json() as { Text: string }
    if (expected.some(text => !detail.Text.includes(text))) throw new Error("Mailbox content differs from demonstrated result")
    await go(`http://localhost:48026/view/${matches[0].ID}`)
    // Email templates can repeat the text in a hidden preheader. Verify the visible body,
    // not the first textual match, before allowing the capture to continue.
    await page.frameLocator("iframe").getByText(expected[0], { exact: false }).filter({ visible: true }).first().waitFor()
  }
  const write = async (field: Locator, value: string) => { await tap(page, field); await field.press("ControlOrMeta+A"); await field.pressSequentially(value, { delay: 95 }) }
  const checks: Record<string, unknown> = { audiovisualValidation: false, pushReceptionVerified: false, perEventToggleAvailableInForm: false }
  try {
    const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { registrations: { include: { shift: true, volunteer: true } } } })
    if (event.slug !== "atelier-rappels" || event.reminderSentAt || event.registrations.length !== 9 || event.registrations.some(r => r.reminderJ2Sent || r.reminderJ1Sent || r.reminderDdSent)) throw new Error("Fresh reminders-changes seed required")
    const changed = await db.shift.findFirstOrThrow({ where: { eventId, label: "Préparation — horaire à modifier", status: "open" } })
    const cancelled = await db.shift.findFirstOrThrow({ where: { eventId, label: "Caisse — créneau à annuler", status: "open" } })
    const draft = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "atelier-rappels-brouillon" } })
    const activeLea = event.registrations.filter(r => r.status === "active" && r.volunteer.email === "video.reminder.dd@example.org")
    if (activeLea.length !== 2) throw new Error("Two-shift fixture missing")
    await scene("welcome", async () => { await page.screencast.showChapter(title, { description: "Un rendez-vous clair, même si le planning change", duration: 2400 }) })
    const message = "Retrouve-nous au stand quinze minutes avant ton horaire. Prends une gourde. Merci pour ton aide !"
    await scene("manual-message", async at => {
      await go(`${eventUrl}/edit`)
      await at(0.15)
      const saved = page.waitForResponse(r => r.url().endsWith(`/api/admin/events/${eventId}`) && r.request().method() === "PATCH" && r.ok() && r.request().postDataJSON().reminderMessage === message)
      await write(page.getByPlaceholder("Consignes vestimentaires, point de RDV, accès, parking…"), message)
      await saved; await page.getByText("Enregistré ✓", { exact: true }).waitFor()
      if ((await db.event.findUniqueOrThrow({ where: { id: eventId } })).reminderMessage !== message) throw new Error("Reminder auto-save failed")
      checks.messageAutoSaved = true
    })
    await scene("manual-send", async at => {
      await go(eventUrl)
      const prior = new Set((await inbox()).map(m => m.ID))
      await tap(page, page.getByRole("button", { name: /Envoyer le rappel \(/ }))
      const dialog = page.getByRole("dialog", { name: "Envoyer le rappel ?" })
      await at(0.15); await tap(page, dialog.getByRole("button", { name: "Annuler", exact: true }))
      if ((await inbox()).some(m => !prior.has(m.ID)) || (await db.event.findUniqueOrThrow({ where: { id: eventId } })).reminderSentAt) throw new Error("Cancel sent a reminder")
      await at(0.25); await tap(page, page.getByRole("button", { name: /Envoyer le rappel \(/ }))
      await at(0.32)
      const response = page.waitForResponse(r => r.url().endsWith("/send-reminder") && r.request().method() === "POST")
      await tap(page, dialog.getByRole("button", { name: "Envoyer", exact: true }))
      const sent = await response; const result = await sent.json()
      if (!sent.ok() || result.sent !== 3 || result.failed) throw new Error("Manual reminder delivery failed")
      await dialog.getByText("3 rappels envoyés", { exact: true }).waitFor()
      await at(0.43)
      const mails = (await inbox()).filter(m => !prior.has(m.ID))
      if (mails.length !== 3 || mails.some(m => m.To.some(t => /request|waiting/.test(t.Address)))) throw new Error("Manual reminder audience incorrect")
      await openMail(mails, "video.reminder.dd@example.org", ["Prends une gourde", ...activeLea.flatMap(r => [r.shift.startTime, r.shift.endTime])])
      checks.manualReminder = { sent: 3, cancelledWithoutEmail: true, twoShiftsInOneEmail: true, mailIds: mails.map(m => m.ID) }
    })
    await scene("organization", async at => {
      await go(`${base}/admin/settings/notifications`)
      const checkbox = page.getByRole("checkbox", { name: "Rappel J-1", exact: true })
      const save = async (enabled: boolean) => {
        await tap(page, checkbox)
        const response = page.waitForResponse(r => r.url().endsWith("/settings/notifications") && r.request().method() === "PATCH")
        await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
        const result = await response
        if (!result.ok() || (await result.json()).settings.reminders.j1 !== enabled) throw new Error("Organization reminder setting not persisted")
        await page.getByText("Réglages enregistrés.", { exact: true }).waitFor()
      }
      if (!await checkbox.isChecked()) throw new Error("J-1 fixture must start enabled")
      await at(0.48); await save(false)
      await at(0.68); await save(true)
      await at(0.83); await page.getByLabel("Adresse de réponse", { exact: true }).scrollIntoViewIfNeeded()
      checks.organizationSavedOffThenOn = true
    })
    await scene("event-switch", async at => {
      await go(`${eventUrl}/edit`)
      await page.getByPlaceholder("Consignes vestimentaires, point de RDV, accès, parking…").scrollIntoViewIfNeeded()
      await at(0.70); await go(`${base}/admin/events/${draft.id}`)
      await page.getByRole("heading", { name: "Atelier en brouillon", exact: true }).waitFor()
    })
    await scene("timing", async at => {
      await go(`${base}/admin/settings/notifications`)
      const prior = new Set((await inbox()).map(m => m.ID))
      const run = async () => {
        const response = await page.request.post(`${base}/api/cron/reminders`, { headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {} })
        if (!response.ok()) throw new Error(`Local cron HTTP ${response.status()}`)
        return response.json()
      }
      const first = await run()
      const mails = (await inbox()).filter(m => !prior.has(m.ID) && m.Subject.includes("Atelier des rappels") && /J-2|Demain|aujourd'hui/i.test(m.Subject))
      if (mails.length !== 3) throw new Error("Expected three actual automatic reminders")
      const second = await run()
      if ((await inbox()).filter(m => !prior.has(m.ID) && m.Subject.includes("Atelier des rappels") && /J-2|Demain|aujourd'hui/i.test(m.Subject)).length !== 3) throw new Error("Duplicate automatic reminder")
      for (const [index, email] of ["video.reminder.j2@example.org", "video.reminder.j1@example.org", "video.reminder.dd@example.org"].entries()) {
        await at(0.53 + index * 0.15)
        const shift = event.registrations.find(r => r.status === "active" && r.volunteer.email === email)!.shift
        // J-2 includes the range; J-1/day-of templates show the start only.
        await openMail(mails, email, ["Stand d'information", shift.startTime, ...(index === 0 ? [shift.endTime] : [])])
      }
      checks.automaticReminders = { mailIds: mails.map(m => m.ID), noDuplicate: true, first, second }
    })
    await scene("exclusions", async at => {
      await go(`${eventUrl}/registrations`)
      const search = page.getByRole("textbox", { name: "Rechercher un bénévole", exact: true })
      await write(search, "Lucas")
      await at(0.25); await write(search, "Anna")
      await at(0.48); await go(`${eventUrl}/shifts`)
      await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
      await page.getByRole("row").filter({ hasText: "Accueil — 24 heures" }).getByText("Fermé", { exact: true }).scrollIntoViewIfNeeded()
      const regs = await db.registration.findMany({ where: { event: { organizationId: "default", slug: { in: ["atelier-rappels", "atelier-rappels-brouillon", "atelier-rappels-coupes"] } } }, include: { event: true, volunteer: true, shift: true } })
      const excluded = regs.filter(r => r.event.slug !== "atelier-rappels" || /request|waiting/.test(r.volunteer.email ?? ""))
      if (excluded.some(r => r.reminderJ2Sent || r.reminderJ1Sent || r.reminderDdSent) || !regs.some(r => r.shift.status === "closed" && r.reminderJ1Sent)) throw new Error("Reminder exclusions or closed shift incorrect")
      checks.excludedWitnesses = excluded.length
    })
    await scene("changed", async at => {
      const prior = new Set((await inbox()).map(m => m.ID))
      const newStart = addMinutes(changed.startTime, 30), newEnd = addMinutes(changed.endTime, 30)
      await tap(page, page.getByRole("row").filter({ hasText: changed.label }).getByRole("button", { name: "Modifier", exact: true }))
      await write(page.getByLabel("Début *", { exact: true }), newStart)
      await at(0.25); await write(page.getByLabel("Fin *", { exact: true }), newEnd)
      const response = page.waitForResponse(r => r.url().endsWith(`/shifts/${changed.id}`) && r.request().method() === "PATCH")
      await at(0.40); await tap(page, page.getByRole("button", { name: "Enregistrer", exact: true }))
      const result = await response
      if (!result.ok() || (await result.json()).notified !== 1) throw new Error("Wrong change notification count")
      await page.getByRole("row").filter({ hasText: changed.label }).getByText(`${newStart}–${newEnd}`, { exact: true }).waitFor()
      let mails: Mail[] = []
      for (let i = 0; i < 30; i++) { mails = (await inbox()).filter(m => !prior.has(m.ID)); if (mails.length) break; await page.waitForTimeout(250) }
      if (mails.length !== 1) throw new Error("Expected one received change email")
      await at(0.44); await openMail(mails, "video.reminder.dd@example.org", [newStart, newEnd, "Préparation"])
      await at(0.78); await go(`${eventUrl}/shifts`)
      await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
      await page.getByRole("row").filter({ hasText: changed.label }).getByText(`${newStart}–${newEnd}`, { exact: true }).scrollIntoViewIfNeeded()
      checks.changed = { notified: 1, pendingRequestExcluded: true, mailId: mails[0].ID }
    })
    await scene("cancelled", async at => {
      await go(`${eventUrl}/shifts`); await tap(page, page.getByRole("button", { name: "Liste", exact: true }))
      const prior = new Set((await inbox()).map(m => m.ID))
      await tap(page, page.getByRole("row").filter({ hasText: cancelled.label }).getByRole("button", { name: "Supprimer", exact: true }))
      const dialog = page.getByRole("alertdialog")
      await dialog.waitFor(); await at(0.23)
      const response = page.waitForResponse(r => r.url().endsWith(`/shifts/${cancelled.id}`) && r.request().method() === "DELETE")
      await tap(page, dialog.getByRole("button", { name: /^Supprimer/ }))
      if (!(await response).ok()) throw new Error("Cancellation failed")
      let mails: Mail[] = []
      for (let i = 0; i < 30; i++) { mails = (await inbox()).filter(m => !prior.has(m.ID)); if (mails.length === 2) break; await page.waitForTimeout(250) }
      if (mails.length !== 2) throw new Error("Expected two actual cancellation emails")
      await at(0.42); await openMail(mails, "video.reminder.j2@example.org", ["Caisse"])
      await at(0.52); await openMail(mails, "video.reminder.request@example.org", ["Caisse"])
      const after = await db.shift.findUniqueOrThrow({ where: { id: cancelled.id }, include: { registrations: true } })
      if (after.status !== "cancelled" || after.registrations.length !== 2 || after.registrations.some(r => r.status !== "cancelled")) throw new Error("Cancelled shift registrations incorrect")
      await at(0.62); await go(`${eventUrl}/shifts`)
      checks.cancelled = { registrations: 2, includesPendingRequest: true, mailIds: mails.map(m => m.ID) }
    })
    await writeFile(path.join(directory, "reminder-capture-checks.json"), JSON.stringify({ checkedAt: new Date().toISOString(), ...checks }, null, 2))
  } finally { await db.$disconnect() }
}
