// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { openPayload } from "../../src/lib/notifications/outbox"

/** Inspect exact synthetic scope before uploading any delivery capture to review. */
export async function verifyDeliveryReviewFixture(db: PrismaClient, directory: string) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const orgId = "video-delivery"
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId } })
  assert(org.name === "Formation — suivi des emails" && org.slug === "formation-livraisons" && org.replyToEmail === "video.delivery.owner@example.org")
  const people = await db.volunteer.findMany({ where: { organizationId: orgId } })
  const names: Record<string, string> = { pending: "Jules", retrying: "Sarah", recoverable: "Emma", wrong: "Léa", sent: "Nicolas" }
  assert.equal(people.length, 5)
  for (const person of people) {
    const label = person.id.replace("video-delivery-member-", "")
    assert(person.id === `video-delivery-member-${label}` && names[label] === person.firstName && person.lastName === "Exemple" && person.email === `video.delivery.${label === "wrong" ? "corrected" : label}@example.org` && !person.phone && person.notes === "Données fictives pour la démonstration des livraisons.")
  }
  const admins = await db.adminUser.findMany({ where: { organizationId: orgId } })
  assert.equal(admins.length, 2)
  assert(admins.every(admin => admin.id === "video-delivery-owner" ? admin.role === "admin" && admin.name === "Élodie Exemple" && admin.email === "video.delivery.owner@example.org" : admin.id === "video-delivery-organizer" && admin.role === "organizer" && admin.name === "Marc Exemple" && admin.email === "video.delivery.organizer@example.org"))
  const events = await db.event.findMany({ where: { organizationId: orgId }, include: { shifts: true, registrations: true } })
  assert.equal(events.length, 1)
  const event = events[0]
  assert(event.id === "video-delivery-event" && event.title === "Atelier des emails" && event.slug === "atelier-des-emails" && event.publicStatus === "draft" && !event.isListed && !event.remindersEnabled)
  assert(event.shifts.length === 1 && event.shifts[0].id === "video-delivery-shift" && event.shifts[0].label === "Accueil de démonstration" && event.registrations.length === 2)
  assert(event.registrations.every(reg => reg.status === "active" && ["video-delivery-registration", "video-delivery-registration-partial"].includes(reg.id) && people.some(person => person.id === reg.volunteerId)))
  const capture = JSON.parse(await readFile(path.join(directory, "capture-checks.json"), "utf8"))
  assert(capture.actualInitialWorkerStates && capture.actualOrganizerReadOnlySettings && capture.samePayloadOnRetry && capture.correctedRecipientMailIsNew && capture.oldPayloadUnchanged && capture.onlyFailedResent && capture.repeatedResendCreatedNothing)
  assert(capture.smtpAttemptsDuringCapture.filter((attempt: { accepted: boolean }) => !attempt.accepted).length === 6)
  const histories = await db.targetedMessage.findMany({ where: { organizationId: orgId } })
  assert.equal(histories.length, 2)
  assert(histories.every(item => item.eventId === event.id && item.authorId === "video-delivery-organizer" && item.authorName === "Marc Exemple" && item.recipientCount === 2 && ["Formation — adresse corrigée", "Formation — échec partiel"].includes(item.subject)))
  const rows = await db.notificationOutbox.findMany({ where: { organizationId: orgId } })
  assert.equal(rows.length, 9)
  assert(rows.every(row => openPayload(row.payload).kind === "targeted_message" && /^video\.delivery\.[a-z-]+@example\.org$/.test(openPayload(row.payload).recipient.email ?? "") && openPayload(row.payload).data.eventTitle === "Atelier des emails"))
  const response = await fetch("http://localhost:48026/api/v1/messages?limit=1000", { signal: AbortSignal.timeout(10000) })
  assert(response.ok)
  const inbox = await response.json() as { messages: { ID: string; To: { Address: string }[] }[]; messages_count?: number }
  assert(!inbox.messages_count || inbox.messages_count <= inbox.messages.length)
  assert(inbox.messages.every(mail => mail.To.every(to => /@(?:example\.(?:org|com)|localhost)$/.test(to.Address))))
  for (const [id, recipient] of [[capture.actualRetryMailId, "video.delivery.recoverable@example.org"], [capture.correctedRecipientMailId, "video.delivery.corrected@example.org"]]) {
    assert(inbox.messages.some(mail => mail.ID === id && mail.To.length === 1 && mail.To[0].Address === recipient))
  }
}
