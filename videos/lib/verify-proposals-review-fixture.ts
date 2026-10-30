// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { surnameOf } from "./fixture-names"

/** Prove the entire dedicated classroom is synthetic before sending its rendered pixels. */
export async function verifyProposalsReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45439" && url.pathname === "/benevoles_video", "Dedicated batch35 video database required")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-proposals" }, include: { admins: true, volunteers: true, events: { include: { registrations: true, shifts: true, sectorLeaders: true, places: true } } } })
  assert(org.slug === "formation-propositions" && org.name === "Association des Rencontres du Val d'Orsel")
  assert(org.admins.length === 1 && org.admins[0].id === "video-proposals-owner" && org.admins[0].email === "video.proposals.owner@example.org")
  const keys = new Set(["aline", "nicolas", "lea", "noah", "sarah", "lucas", "camille", "zoe", "emma", "paul", "lou", "jules"])
  assert(org.volunteers.length === keys.size && org.volunteers.every(v => {
    const key = v.id.replace(/^video-proposals-person-/, "")
    return keys.has(key) && v.id === `video-proposals-person-${key}` && v.email === `video.proposals.${key}@example.org` && v.lastName === surnameOf(v.firstName) && !v.phone
  }))
  assert(org.events.length === 1)
  const event = org.events[0]
  assert(event.id === "video-proposals-event" && event.slug === "rencontres-du-val" && event.title === "Rencontres du Val d'Orsel")
  assert(event.sectorLeaders.length === 0 && event.workloadProtectionEnabled && event.availabilityEnabled)
  assert(event.shifts.length === 14 && event.shifts.every(s => s.id.startsWith("video-proposals-shift-") && s.eventId === event.id))
  assert(event.registrations.length === 0, "The filmed proposal must remain unpublished")
  assert(event.places.length === 3 && event.places.every(p => ["Entrée du site", "Scène des Tilleuls", "Kiosque"].includes(p.name)))
}
