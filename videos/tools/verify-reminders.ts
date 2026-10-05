// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Runs the real local cron twice. No production endpoint, tokens or secrets in reports. */
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { mkdir, writeFile } from "node:fs/promises"

type Mail = { ID: string; Subject: string; To: { Address: string }[] }

async function main() {
  const base = process.env.VIDEO_BASE_URL ?? "http://localhost:43100"
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname) || !process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Requires local video environment")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  try {
    const inbox = async (): Promise<Mail[]> => {
      const response = await fetch("http://localhost:48026/api/v1/messages?limit=1000")
      if (!response.ok) throw new Error(`Local mailbox: HTTP ${response.status}`)
      return (await response.json()).messages
    }
    const regs = () => db.registration.findMany({ where: { event: { organizationId: "default", slug: { in: ["atelier-rappels", "atelier-rappels-brouillon", "atelier-rappels-coupes"] } } }, select: { id: true, status: true, reminderJ2Sent: true, reminderJ1Sent: true, reminderDdSent: true, event: { select: { slug: true } }, shift: { select: { startTime: true, endTime: true, status: true } }, volunteer: { select: { email: true } } } })
    const before = await regs()
    if (before.length !== 11 || before.some(r => r.reminderJ2Sent || r.reminderJ1Sent || r.reminderDdSent)) throw new Error("Run fresh reminders-changes seed first")
    const beforeMail = new Set((await inbox()).map(m => m.ID))
    const run = async () => {
      const response = await fetch(`${base}/api/cron/reminders`, { method: "POST", headers: process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {} })
      if (!response.ok) throw new Error(`Local cron: HTTP ${response.status}`)
      return await response.json()
    }
    const first = await run()
    const afterFirst = await regs()
    for (const [email, field] of [["video.reminder.j2@example.org", "reminderJ2Sent"], ["video.reminder.j1@example.org", "reminderJ1Sent"], ["video.reminder.dd@example.org", "reminderDdSent"]] as const) {
      if (afterFirst.filter(r => r.event.slug === "atelier-rappels" && r.volunteer.email === email && r[field]).length !== 1) throw new Error(`Expected one marker for ${field}`)
    }
    const witnesses = afterFirst.filter(r => r.event.slug !== "atelier-rappels" || ["video.reminder.request@example.org", "video.reminder.waiting@example.org"].includes(r.volunteer.email ?? ""))
    if (witnesses.some(r => r.reminderJ2Sent || r.reminderJ1Sent || r.reminderDdSent)) throw new Error("Excluded registration received a reminder marker")
    const newReminderMail = (await inbox()).filter(m => !beforeMail.has(m.ID) && m.Subject.includes("Atelier des rappels") && /J-2|Demain|aujourd'hui/i.test(m.Subject))
    if (newReminderMail.length !== 3) throw new Error(`Expected 3 actual reminders, got ${newReminderMail.length}`)
    for (const email of ["video.reminder.j2@example.org", "video.reminder.j1@example.org", "video.reminder.dd@example.org"]) if (newReminderMail.filter(m => m.To.some(t => t.Address === email)).length !== 1) throw new Error("Actual reminder recipient mismatch")
    const second = await run()
    const afterSecond = await regs()
    if (JSON.stringify(afterFirst) !== JSON.stringify(afterSecond)) throw new Error("Second run changed fixture registrations")
    const finalReminderMail = (await inbox()).filter(m => !beforeMail.has(m.ID) && m.Subject.includes("Atelier des rappels") && /J-2|Demain|aujourd'hui/i.test(m.Subject))
    if (finalReminderMail.length !== 3) throw new Error("Second run duplicated reminder emails")
    const report = { checkedAt: new Date().toISOString(), scope: "local real cron and mailbox, not audiovisual validation", actualReminderEmails: 3, closedShiftReminded: afterFirst.some(r => r.shift.status === "closed" && r.reminderJ1Sent), excludedWitnesses: witnesses.length, secondRunNoDuplicate: true, firstTotals: first.totals, secondTotals: second.totals, reconciliation: { first: first.waitlist, second: second.waitlist }, mailIds: finalReminderMail.map(m => m.ID) }
    await mkdir("videos/output/reminders-changes", { recursive: true })
    await writeFile("videos/output/reminders-changes/reminder-preflight.json", JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { await db.$disconnect() }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
