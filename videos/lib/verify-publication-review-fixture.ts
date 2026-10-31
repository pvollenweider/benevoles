// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { surnameOf } from "./fixture-names"

/**
 * Prove the dedicated classroom of ASSIGNMENT_PUBLICATION is synthetic, and in the state the take
 * leaves it, before sending its rendered pixels: 29 published registrations (Noah's car park
 * withdrawn), Emma's corrected answer to review, and only the fixture's own emails.
 */
export async function verifyPublicationReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["45439", "45441"].includes(url.port) && url.pathname === "/benevoles_video", "Dedicated video database required")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-publication" }, include: { admins: true, volunteers: true, events: { include: { registrations: true, shifts: true, sectorLeaders: true, places: true, draftAssignments: true, availabilityRequests: { include: { days: { include: { ranges: true } } } } } } } })
  assert(org.slug === "formation-publication" && org.name === "Association des Rencontres du Val d'Orsel")
  assert(org.admins.length === 1 && org.admins[0].id === "video-publication-owner" && org.admins[0].email === "video.publication.owner@example.org")
  const keys = new Set(["aline", "nicolas", "lea", "noah", "sarah", "lucas", "camille", "zoe", "emma", "paul", "lou", "jules"])
  assert(org.volunteers.length === keys.size && org.volunteers.every(v => {
    const key = v.id.replace(/^video-publication-person-/, "")
    return keys.has(key) && v.id === `video-publication-person-${key}` && v.email === `video.publication.${key}@example.org` && v.lastName === surnameOf(v.firstName) && !v.phone
  }))
  assert(org.events.length === 1)
  const event = org.events[0]
  assert(event.id === "video-publication-event" && event.title === "Rencontres du Val d'Orsel" && event.sectorLeaders.length === 0 && event.workloadProtectionEnabled && event.availabilityEnabled)
  assert(event.shifts.length === 14 && event.shifts.every(s => s.id.startsWith("video-publication-shift-")))
  assert(event.places.length === 3)
  // The publication: 29 registrations from the drafts; only Noah's Sunday car park withdrawn.
  assert(event.registrations.length === 29 && event.registrations.every(r => r.source === "admin_draft"), "The filmed publication is complete")
  const withdrawn = event.registrations.filter(r => r.status !== "active")
  assert(withdrawn.length === 1 && withdrawn[0].volunteerId === "video-publication-person-noah" && withdrawn[0].shiftId === "video-publication-shift-par-sun" && withdrawn[0].status === "cancelled")
  assert(event.draftAssignments.length === 29 && event.draftAssignments.every(d => d.status === "published" && d.registrationId))
  // Emma's correction: Friday « Pas disponible », her answer to review after the publication.
  const emma = event.availabilityRequests.find(r => r.volunteerId === "video-publication-person-emma")
  assert(emma && emma.reviewReason?.split(",").includes("published") && emma.tokenHash && !emma.tokenLegacy)
  const friday = [...emma.days].sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  assert(friday && friday.ranges.length === 0, "Emma's Friday is « Pas disponible »")
  // Only the fixture's own emails: placements, Emma's link, the withdrawal and its digests.
  const { openPayload } = await import("../../src/lib/notifications/outbox")
  const messages = await db.notificationOutbox.findMany({ where: { organizationId: org.id }, select: { dedupeKey: true, status: true, payload: true } })
  const kinds = ["registration_added_by_organizer", "availability_request", "registration_cancelled", "registration_withdrawn", "availability_changed"]
  assert(messages.every(m => kinds.some(k => m.dedupeKey?.startsWith(`${k}:`)) && /^video\.publication\.[a-z]+@example\.org$/.test(openPayload(m.payload).recipient.email ?? "")), "only the fixture's emails, to its own addresses")
  assert.equal(messages.filter(m => m.dedupeKey?.startsWith("registration_added_by_organizer:") && m.status === "sent").length, 11)
  assert.equal(messages.filter(m => m.dedupeKey?.startsWith("registration_cancelled:") && m.status === "sent").length, 1)
  assert.equal(messages.filter(m => m.dedupeKey?.startsWith("availability_request:") && m.status === "sent").length, 1)
}
