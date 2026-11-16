// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { registrationToken } from "../../src/lib/token-vault"
export const PAGES_PERSONAL_TOKEN = "demo-video-pages-aline-registration"
export async function preparePagesVolunteer(db: PrismaClient) {
  const organizationId = "video-foundation-pages", eventId = `${organizationId}-event-0`
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { shifts: true } })
  assert(event.organizationId === organizationId && event.shifts.length === 2)
  const volunteerId = `${organizationId}-aline`, id = `${organizationId}-registration-aline`
  const otherMembers = await db.volunteer.count({ where: { organizationId, id: { not: volunteerId } } })
  const otherRegistrations = await db.registration.count({ where: { eventId, id: { not: id } } })
  assert(otherMembers === 0 && otherRegistrations === 0, "Only the exact owned page-training participant is permitted")
  await db.volunteer.upsert({ where: { id: volunteerId }, create: { id: volunteerId, organizationId, firstName: "Aline", lastName: "Mercier", email: "video.pages.aline@example.org", active: true }, update: {} })
  await db.registration.upsert({ where: { id }, create: { id, eventId, shiftId: `${eventId}-shift-0`, volunteerId, status: "active", source: "admin_manual", ...registrationToken.data(PAGES_PERSONAL_TOKEN) }, update: {} })
  const volunteer = await db.volunteer.findUniqueOrThrow({ where: { id: volunteerId } })
  const registration = await db.registration.findUniqueOrThrow({ where: { id } })
  assert(volunteer.organizationId === organizationId && volunteer.firstName === "Aline" && volunteer.lastName === "Mercier" && volunteer.email === "video.pages.aline@example.org")
  assert(registration.eventId === eventId && registration.volunteerId === volunteerId && registration.shiftId === `${eventId}-shift-0` && registration.status === "active")
}
