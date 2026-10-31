// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { surnameOf } from "./fixture-names"

/** Only the dedicated synthetic classroom may be sent for audiovisual review. */
export async function verifyVolunteerAvailabilityReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45441" && url.pathname === "/benevoles_video", "Dedicated batch37 video database required")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-event-availability" }, include: { admins: true, volunteers: true, events: { include: { registrations: true, shifts: true, availabilityRequests: { include: { days: { include: { ranges: true } } } } } } } })
  assert(org.slug === "formation-disponibilites" && org.name === "Association des Lanternes de Combe-Aurel")
  assert(org.admins.length === 1 && org.admins[0].id === "video-event-availability-owner" && org.admins[0].email === "video.disponibilites.owner@example.org")
  assert(org.volunteers.length === 1)
  const person = org.volunteers[0]
  assert(person.id === "video-event-availability-morgane" && person.firstName === "Morgane" && person.lastName === surnameOf("Morgane") && person.email === "video.disponibilites.morgane@example.org" && !person.phone)
  assert(org.events.length === 1)
  const event = org.events[0]
  assert(event.id === "video-event-availability-event" && event.slug === "fete-des-lanternes" && event.title === "Fête des Lanternes de Combe-Aurel")
  assert(event.publicStatus === "draft" && event.availabilityEnabled && event.registrations.length === 0 && event.shifts.length === 0)
  assert(event.availabilityRequests.length === 1)
  const request = event.availabilityRequests[0]
  assert(request.volunteerId === person.id && request.answeredBy === "volunteer" && request.answeredAt && request.sentAt && request.tokenHash && request.tokenEnc && !request.tokenLegacy)
  const days = [...request.days].sort((a, b) => a.date.getTime() - b.date.getTime())
  assert(days.length === 3 && days[2].ranges.length === 0)
  for (const day of days.slice(0, 2)) assert.deepEqual(day.ranges.map(r => `${r.startTime}-${r.endTime}`).sort(), ["09:00-12:00", "20:00-03:00"])
  const messages = await db.notificationOutbox.findMany({ where: { organizationId: org.id }, select: { dedupeKey: true, status: true, payload: true } })
  assert(messages.length === 1 && messages[0].dedupeKey?.startsWith(`availability_request:${event.id}:${request.id}:`) && messages[0].status === "sent")
  const { openPayload } = await import("../../src/lib/notifications/outbox")
  const payload = openPayload(messages[0].payload)
  assert(payload.kind === "availability_request" && payload.recipient.email === person.email && payload.organizationId === org.id && payload.volunteerId === person.id)
}
