// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
export async function verifyDayOfReviewFixture(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const org = await db.organization.findUniqueOrThrow({ where: { id: "video-dayof" }, include: { volunteers: true, admins: true, events: { include: { shifts: true, registrations: true, sectorLeaders: true } } } })
  assert(org.slug === "formation-jour-j" && org.name === "Formation — accueil et jour J")
  assert(org.admins.length === 1 && org.admins[0].email === "video.dayof.owner@example.org")
  const names = ["Aline", "Nicolas", "Léa", "Noah", "Sarah", "Lucas", "Camille", "Zoé"]
  assert(org.volunteers.length === 8 && org.volunteers.every(v => /^video-dayof-attendance-person-[0-7]$/.test(v.id) && v.email === `video.attendance.${v.id.slice(-1)}@example.org` && v.firstName === names[Number(v.id.slice(-1))] && v.lastName === "Exemple" && (v.id.endsWith("7") ? v.phone === "079 000 00 01" : v.phone === null) && v.notes === null))
  assert(org.events.length === 2 && org.events.every(e => ["video-dayof-event-pointage", "video-dayof-event-live"].includes(e.id) && e.description === "Données fictives de formation uniquement." && e.sectorLeaders.length === 0 && e.shifts.every(s => /^video-dayof-shift-(old-[0-2]|running|upcoming|earlier|night)$/.test(s.id)) && e.registrations.every(r => /^video-dayof-registration-(old-[0-7]|zoe|upcoming|earlier|night)$/.test(r.id) && /^video-dayof-attendance-person-[0-7]$/.test(r.volunteerId))))
  const old = org.events.find(e => e.id.endsWith("pointage"))!
  const live = org.events.find(e => e.id.endsWith("live"))!
  assert(old.registrations.length === 8 && old.shifts.length === 3 && live.registrations.length === 4 && live.shifts.length === 4)
}
