// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Real UI and mailbox preflight. Never a claim of audiovisual validation. */
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"

type Mail = { ID: string; To: { Address: string }[]; Subject: string }

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video environment required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const event = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "atelier-rappels" }, include: { registrations: { include: { volunteer: true, shift: true } } } })
    if (event.reminderSentAt || event.registrations.length !== 9) throw new Error("Fresh reminders-changes fixtures required")
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const inbox = async (): Promise<Mail[]> => {
      const response = await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")
      if (!response.ok()) throw new Error(`Mailbox HTTP ${response.status()}`)
      return (await response.json()).messages
    }
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    await page.goto(`${base}/admin/events/${event.id}/edit`)
    const message = "Retrouve-nous au stand quinze minutes avant ton horaire. Prends une gourde. Merci pour ton aide !"
    const saved = page.waitForResponse(r => r.url().endsWith(`/api/admin/events/${event.id}`) && r.request().method() === "PATCH" && r.ok())
    await page.getByPlaceholder("Consignes vestimentaires, point de RDV, accès, parking…").fill(message)
    await saved
    await page.getByText("Enregistré ✓", { exact: true }).waitFor()
    if ((await db.event.findUniqueOrThrow({ where: { id: event.id } })).reminderMessage !== message) throw new Error("Auto-save did not persist the reminder")
    await page.goto(`${base}/admin/events/${event.id}`)
    const before = new Set((await inbox()).map(m => m.ID))
    const requests: string[] = []
    page.on("request", r => { if (r.method() === "POST" && r.url().endsWith("/send-reminder")) requests.push(r.url()) })
    await page.getByRole("button", { name: /Envoyer le rappel \(/ }).click()
    const modal = page.getByRole("dialog", { name: "Envoyer le rappel ?" })
    await modal.waitFor()
    await modal.getByRole("button", { name: "Annuler", exact: true }).click()
    await page.waitForTimeout(500)
    if (requests.length || (await inbox()).some(m => !before.has(m.ID)) || (await db.event.findUniqueOrThrow({ where: { id: event.id } })).reminderSentAt) throw new Error("Cancellation caused a send")
    await page.getByRole("button", { name: /Envoyer le rappel \(/ }).click()
    const sent = page.waitForResponse(r => r.url().endsWith("/send-reminder") && r.request().method() === "POST")
    await modal.getByRole("button", { name: "Envoyer", exact: true }).click()
    const response = await sent
    const result = await response.json()
    if (!response.ok() || result.sent !== 3 || result.failed !== 0) throw new Error("Expected three actual manual reminders")
    await modal.getByText("3 rappels envoyés", { exact: true }).waitFor()
    const newMail = (await inbox()).filter(m => !before.has(m.ID))
    const active = event.registrations.filter(r => r.status === "active")
    const recipients = [...new Set(active.map(r => r.volunteer.email).filter(Boolean))]
    if (newMail.length !== recipients.length || recipients.some(email => newMail.filter(m => m.To.some(t => t.Address === email)).length !== 1)) throw new Error("Wrong recipients or duplicate reminders")
    const lea = newMail.find(m => m.To.some(t => t.Address === "video.reminder.dd@example.org"))!
    const detailResponse = await page.request.get(`http://localhost:48026/api/v1/message/${lea.ID}`)
    const detail = await detailResponse.json() as { Text: string }
    const leaShifts = active.filter(r => r.volunteer.email === "video.reminder.dd@example.org").map(r => r.shift)
    if (leaShifts.length !== 2 || !detail.Text.includes("Prends une gourde") || leaShifts.some(s => !detail.Text.includes(s.startTime) || !detail.Text.includes(s.endTime) || !detail.Text.includes(s.roleName))) throw new Error("Actual email does not contain both shifts and the custom message")
    const report = { checkedAt: new Date().toISOString(), scope: "real local UI, persisted data and received emails; no audiovisual validation", automaticSaveVerified: true, cancelledWithoutRequestOrEmail: true, sent: result.sent, excludedRequestAndWaitlist: true, oneEmailPerActiveVolunteer: true, leaTwoShiftsInOneEmail: true, customMessageReceived: true, mailIds: newMail.map(m => m.ID) }
    await mkdir("videos/output/reminders-changes", { recursive: true })
    await writeFile("videos/output/reminders-changes/manual-reminder-preflight.json", JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await browser.close(); await db.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
