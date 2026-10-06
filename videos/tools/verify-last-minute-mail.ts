// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { request } from "playwright"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { openPayload } from "../../src/lib/notifications/outbox"
import { readFile, writeFile } from "node:fs/promises"

async function main() {
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video database required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const http = await request.newContext()
  try {
    const directory = "videos/output/last-minute-changes"
    const proof = JSON.parse(await readFile(`${directory}/functional-checks.json`, "utf8"))
    if (!proof.priorAttendancePreserved || !proof.actualCausalJournal) throw new Error("Functional proof missing")
    const rows = await db.notificationOutbox.findMany({ where: { organizationId: "video-last-minute" }, orderBy: { createdAt: "asc" } })
    if (!rows.length || rows.some(row => row.status !== "sent")) throw new Error("All actual notifications must have been sent")
    const payloads = rows.map(row => ({ row, payload: openPayload(row.payload) }))
    const expected = [
      { kind: "waitlist_offered", email: "video.last-minute.person.1@example.org" },
      { kind: "shift_modified", email: "video.last-minute.person.4@example.org" },
      { kind: "shift_cancelled", email: "video.last-minute.person.0@example.org" },
      { kind: "shift_cancelled", email: "video.last-minute.person.5@example.org" },
    ]
    for (const item of expected) if (payloads.filter(({ payload }) => payload.kind === item.kind && payload.recipient.email === item.email).length !== 1) throw new Error(`Expected actual notification ${item.kind} missing`)
    if (payloads.some(({ payload }) => payload.kind === "shift_modified" && payload.recipient.email !== "video.last-minute.person.4@example.org")) throw new Error("Pending request incorrectly notified of a schedule change")
    const inboxResponse = await http.get("http://localhost:48026/api/v1/messages?limit=1000")
    if (!inboxResponse.ok()) throw new Error("Local inbox unavailable")
    const inbox = await inboxResponse.json() as { messages: { ID: string; To: { Address: string }[]; Created: string; Subject: string }[] }
    const actualMail: { kind: string; mailId: string; recipient: string }[] = []
    for (const { row, payload } of payloads) {
      if (!payload.recipient.email) throw new Error("Demonstrated notification has no email recipient")
      const candidates = inbox.messages.filter(mail => mail.To.some(to => to.Address === payload.recipient.email) && Date.parse(mail.Created) >= row.createdAt.getTime() - 1000)
      let match: string | undefined
      for (const mail of candidates) {
        const correctSubject = payload.kind === "registration_confirmation" ? mail.Subject.startsWith("Inscription confirmée") : payload.kind === "targeted_message" ? mail.Subject.startsWith("Un coup de main pour la logistique ?") : payload.kind === "waitlist_offered" ? mail.Subject.includes("Une place s'est libérée") : payload.kind === "shift_modified" ? mail.Subject.includes("changement d'horaire") : payload.kind === "shift_cancelled" ? mail.Subject.includes("créneau annulé") : false
        if (!correctSubject) continue
        const response = await http.get(`http://localhost:48026/api/v1/message/${mail.ID}`)
        const detail = await response.json() as { Text: string }
        const text = detail.Text
        if (payload.kind === "shift_modified" ? text.includes("14:00–16:00") && text.includes("14:30–16:30") && text.includes("Réception du matériel") : payload.kind === "shift_cancelled" ? text.includes("Caisse") && /annul/i.test(text) : payload.kind === "waitlist_offered" ? /place|disponible/i.test(text) && text.includes("Accueil") : text.includes("Fête des imprévus")) { match = mail.ID; break }
      }
      if (!match) throw new Error(`Received content does not prove notification ${payload.kind}`)
      if (actualMail.some(mail => mail.mailId === match)) throw new Error("The same mailbox message cannot prove two different notifications")
      actualMail.push({ kind: payload.kind, mailId: match, recipient: payload.recipient.email })
    }
    await writeFile(`${directory}/mail-checks.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: "actual local SMTP inbox and outbox; not proof of reading by a person or audiovisual validation", messages: actualMail, schedulePendingExcluded: true, activeAndRequestedCancellationDelivered: true }, null, 2))
    console.log(`✓ ${actualMail.length} actual received notifications verified; pending schedule request excluded`)
  } finally { await http.dispose(); await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Last-minute mail verification failed"); process.exitCode = 1 })
