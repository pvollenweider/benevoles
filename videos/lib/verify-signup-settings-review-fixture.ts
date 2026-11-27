// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { surnameOf } from "./fixture-names"

/**
 * Check the complete dedicated organisation of scripts/seed-video-signup-settings.ts before the
 * rendered pixels of EVENT_SIGNUP_PAGE_SETTINGS are sent for review: only its synthetic owner,
 * members (example.org, cast names, no phone), event, sectors, shifts and registrations. The take
 * changes settings only and confirms no sign-up, so the fixture's people are all there is.
 */
export async function verifySignupSettingsReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname === "/benevoles_video", "Isolated local video database required")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-signup" }, include: { admins: true, volunteers: true, events: { include: { registrations: true, shifts: true, sectors: true, sectorLeaders: true } } } })
  assert(org.slug === "formation-inscription" && org.name === "Association des Vendanges de Montvert")
  assert(org.admins.length === 1 && org.admins[0].id === "video-signup-owner" && org.admins[0].email === "video.signup.owner@example.org")
  assert(org.volunteers.length === 5 && org.volunteers.every(v => /^video-signup-person-[a-z]+$/.test(v.id) && /^video\.signup\.[a-z]+@example\.org$/.test(v.email ?? "") && v.lastName === surnameOf(v.firstName) && !v.phone))
  assert(org.events.length === 1)
  const event = org.events[0]
  assert(event.id === "video-signup-event" && event.slug === "fete-des-vendanges" && event.title === "Fête des vendanges de Montvert")
  assert(event.sectorLeaders.length === 0 && event.sectors.every(s => ["Accueil", "Buvette"].includes(s.name)))
  assert(event.shifts.every(s => s.id.startsWith("video-signup-shift-") && s.eventId === event.id))
  assert(event.registrations.every(r => r.eventId === event.id && org.volunteers.some(v => v.id === r.volunteerId)))
}
