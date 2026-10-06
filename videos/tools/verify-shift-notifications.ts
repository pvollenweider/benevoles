// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Mutates only named fixtures in the isolated video DB through the real admin routes. */
import { chromium } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { addMinutes } from "../../src/lib/gantt-utils"
import { openPayload } from "../../src/lib/notifications/outbox"
import { mkdir, writeFile } from "node:fs/promises"

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Only local video fixtures are allowed")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/admin/login`)
    await page.getByLabel("Email", { exact: true }).fill(process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost")
    await page.getByLabel("Mot de passe", { exact: true }).fill(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password")
    await page.getByRole("button", { name: "Se connecter", exact: true }).click()
    await page.waitForURL(/\/admin\/events/)
    const event = await db.event.findFirstOrThrow({ where: { organizationId: "default", slug: "atelier-rappels" } })
    const changed = await db.shift.findFirstOrThrow({ where: { eventId: event.id, label: "Préparation — horaire à modifier", status: "open" }, include: { registrations: true } })
    const cancelled = await db.shift.findFirstOrThrow({ where: { eventId: event.id, label: "Caisse — créneau à annuler", status: "open" }, include: { registrations: true } })
    if (changed.registrations.filter(r => r.status === "active").length !== 1 || changed.registrations.filter(r => r.status === "requested").length !== 1 || cancelled.registrations.length !== 2) throw new Error("Fresh change/cancel fixtures required")
    const priorIds = new Set((await db.notificationOutbox.findMany({ select: { id: true } })).map(r => r.id))
    const newStart = addMinutes(changed.startTime, 30)
    const newEnd = addMinutes(changed.endTime, 30)
    const modified = await page.request.patch(`${base}/api/admin/shifts/${changed.id}`, { data: { startTime: newStart, endTime: newEnd, notifyVolunteers: true } })
    if (!modified.ok() || (await modified.json()).notified !== 1) throw new Error("Expected one actual change notification")
    const removal = await page.request.delete(`${base}/api/admin/shifts/${cancelled.id}`)
    if (!removal.ok()) throw new Error(`Cancellation HTTP ${removal.status()}`)
    const removalResult = await removal.json()
    const after = await db.shift.findUniqueOrThrow({ where: { id: cancelled.id }, include: { registrations: true } })
    if (after.status !== "cancelled" || after.registrations.some(r => r.status !== "cancelled") || after.registrations.some(r => r.checkedInAt?.getTime() !== cancelled.registrations.find(old => old.id === r.id)?.checkedInAt?.getTime())) throw new Error("Cancellation did not preserve the expected data")
    const notificationRows = async () => (await db.notificationOutbox.findMany({ where: { organizationId: "default" } })).filter(r => !priorIds.has(r.id))
    let rows = await notificationRows()
    for (let attempt = 0; attempt < 40 && (rows.length !== 3 || rows.some(r => r.status !== "sent")); attempt++) { await page.waitForTimeout(250); rows = await notificationRows() }
    if (rows.length !== 3 || rows.some(r => r.status !== "sent")) throw new Error("Expected three notifications delivered to local SMTP")
    const payloads = rows.map(r => openPayload(r.payload))
    const changeEmails = payloads.filter(p => p.kind === "shift_modified")
    const cancelEmails = payloads.filter(p => p.kind === "shift_cancelled")
    if (changeEmails.length !== 1 || changeEmails[0].recipient.email !== "video.reminder.dd@example.org" || cancelEmails.length !== 2 || !cancelEmails.some(p => p.recipient.email === "video.reminder.request@example.org") || !cancelEmails.some(p => p.recipient.email === "video.reminder.j2@example.org")) throw new Error("Wrong notification audiences")
    const inboxResponse = await page.request.get("http://localhost:48026/api/v1/messages?limit=1000")
    const inbox = await inboxResponse.json() as { messages: { ID: string; To: { Address: string }[]; Created: string }[] }
    const mailProof = []
    for (const row of rows) {
      const payload = openPayload(row.payload)
      const matches = inbox.messages.filter(m => m.To.some(to => to.Address === payload.recipient.email) && Date.parse(m.Created) >= row.createdAt.getTime() - 1000)
      let matchingId: string | undefined
      for (const mail of matches) {
        const detailResponse = await page.request.get(`http://localhost:48026/api/v1/message/${mail.ID}`)
        const detail = await detailResponse.json() as { Text: string }
        if (payload.kind === "shift_modified" ? detail.Text.includes(newStart) && detail.Text.includes(newEnd) && detail.Text.includes("Préparation") : detail.Text.includes("Caisse") && /annul/i.test(detail.Text)) { matchingId = mail.ID; break }
      }
      if (!matchingId) throw new Error("Actual mailbox content did not match notification")
      mailProof.push({ kind: payload.kind, mailId: matchingId })
    }
    const report = { checkedAt: new Date().toISOString(), scope: "local routes, database and actual mailbox; no audiovisual validation", modified: { notified: 1, oldStart: changed.startTime, newStart, oldEnd: changed.endTime, newEnd, pendingRequestNotNotified: true }, cancellation: { cancelledRegistrations: after.registrations.length, notified: cancelEmails.length, includesPendingRequest: true, checkedInDataUnchanged: true, response: removalResult }, actualMail: mailProof }
    await mkdir("videos/output/reminders-changes", { recursive: true })
    await writeFile("videos/output/reminders-changes/shift-notification-preflight.json", JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await browser.close(); await db.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
