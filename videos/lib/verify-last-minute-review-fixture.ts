// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import type { PrismaClient } from "../../src/generated/prisma/client"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { openPayload } from "../../src/lib/notifications/outbox"

/** Exact dedicated classroom and received synthetic emails, before external video review. */
export async function verifyLastMinuteReviewFixture(db: PrismaClient, directory: string) {
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video database required")
  const organizationId = "video-last-minute"
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
  if (org.slug !== "formation-imprevus" || org.name !== "Formation — imprévus") throw new Error("Wrong last-minute classroom")
  const names = ["Aline", "Nicolas", "Zoé", "Emma", "Sarah", "Lucas"]
  const people = await db.volunteer.findMany({ where: { organizationId }, orderBy: { id: "asc" } })
  if (people.length !== 6 || people.some((person, index) => person.id !== `video-last-minute-person-${index}` || person.firstName !== names[index] || person.lastName !== "Exemple" || person.email !== `video.last-minute.person.${index}@example.org` || person.phone !== `+41 79 000 ${String(index).padStart(4, "0")}` || (person.availabilityNote && person.availabilityNote !== "Peut aussi aider en début d'après-midi après confirmation.") || person.notes)) throw new Error("Last-minute people are not exclusively synthetic")
  const admins = await db.adminUser.findMany({ where: { organizationId } })
  if (admins.length !== 1 || admins[0].id !== "video-last-minute-owner" || admins[0].name !== "Colette Exemple" || admins[0].email !== "video.last-minute.owner@example.org") throw new Error("Last-minute administrator differs")
  const events = await db.event.findMany({ where: { organizationId }, include: { shifts: true, registrations: true } })
  if (events.length !== 1 || events[0].id !== "video-last-minute-event" || events[0].title !== "Fête des imprévus — démonstration" || events[0].shifts.length !== 5 || events[0].shifts.some(shift => !/^video-last-minute-shift-[0-4]$/.test(shift.id)) || events[0].registrations.length !== 9 || events[0].registrations.some(reg => !people.some(person => person.id === reg.volunteerId))) throw new Error("Last-minute event is not exclusively synthetic")
  const capture = JSON.parse(await readFile(path.join(directory, "capture-checks.json"), "utf8"))
  const mail = JSON.parse(await readFile(path.join(directory, "mail-checks.json"), "utf8"))
  if (!capture.offerConfirmed || !capture.logisticsFilled || !capture.priorAttendancePreserved || !capture.actualCausalStory || !mail.schedulePendingExcluded || !Array.isArray(mail.messages) || mail.messages.length !== 6) throw new Error("Current capture and SMTP evidence missing")
  const outbox = await db.notificationOutbox.findMany({ where: { organizationId } })
  if (outbox.length !== 6 || outbox.some(row => row.status !== "sent" || !/^video\.last-minute\.person\.[0-5]@example\.org$/.test(openPayload(row.payload).recipient.email ?? ""))) throw new Error("Last-minute notification recipient differs")
  // Mailpit's sidebar can display other local messages. Reject non-demo domains
  // throughout this local mailbox, not just the six emails opened in the video.
  const response = await fetch("http://localhost:48026/api/v1/messages?limit=1000", { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error("Cannot verify local mailbox")
  const inbox = await response.json() as { messages: { ID: string; To: { Address: string }[] }[]; messages_count?: number }
  if (!Array.isArray(inbox.messages) || (inbox.messages_count && inbox.messages_count > inbox.messages.length)) throw new Error("Local mailbox inventory incomplete")
  if (inbox.messages.some(message => message.To.some(recipient => !/@(?:example\.(?:org|com)|localhost)$/.test(recipient.Address)))) throw new Error("Local mailbox contains a non-demo recipient")
  const mailIds = new Set(inbox.messages.map(message => message.ID))
  if (mail.messages.some((message: { mailId: string; recipient: string }) => !mailIds.has(message.mailId) || !/^video\.last-minute\.person\.[0-5]@example\.org$/.test(message.recipient))) throw new Error("Received classroom message evidence differs")
}
