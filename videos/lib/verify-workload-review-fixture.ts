// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { surnameOf } from "./fixture-names"

/** Check the complete dedicated classroom before sending its rendered pixels for review. */
export async function verifyWorkloadReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && ["45437", "45438", "45439"].includes(url.port) && url.pathname === "/benevoles_video", "Dedicated batch33/34/35 video database required")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-workload" }, include: { admins: true, volunteers: true, events: { include: { registrations: true, shifts: true, sectorLeaders: true, places: true } } } })
  assert(org.slug === "formation-charge" && org.name === "Association du Lac de Montvert")
  assert(org.admins.length === 1 && org.admins[0].id === "video-workload-owner" && org.admins[0].email === "video.workload.owner@example.org")
  assert(org.volunteers.length === 8 && org.volunteers.every(v => /^video-workload-person-[a-z]+$/.test(v.id) && /^video\.workload\.[a-z]+@example\.org$/.test(v.email ?? "") && v.lastName === surnameOf(v.firstName) && !v.phone))
  assert(org.events.length === 1)
  const event = org.events[0]
  assert(event.id === "video-workload-event" && event.slug === "festival-du-lac" && event.title === "Festival du Lac de Montvert")
  assert(event.sectorLeaders.length === 0 && event.workloadProtectionEnabled)
  assert(event.shifts.every(s => s.id.startsWith("video-workload-shift-") && s.eventId === event.id))
  assert(event.registrations.every(r => r.eventId === event.id && org.volunteers.some(v => v.id === r.volunteerId)))
  assert(event.places.length === 4 && event.places.every(p => ["Grande Scène", "Scène du Lac", "Chapiteau", "Le Dôme"].includes(p.name)))
}
