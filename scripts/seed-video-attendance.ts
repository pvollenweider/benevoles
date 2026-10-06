// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient, Shift, Volunteer } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"

/** Dedicated fixture; every check-in shown in the lesson starts unset. */
export async function seedVideoAttendance(db: PrismaClient) {
  const slug = "atelier-pointage"
  await db.event.deleteMany({ where: { organizationId: "default", slug } })
  const date = new Date("2026-10-10T00:00:00Z")
  const event = await db.event.create({ data: { organizationId: "default", slug, title: "Accueil des bénévoles — pointage", startDate: date, endDate: date, publicStatus: "published", remindersEnabled: false } })
  const definitions = [
    { roleName: "Accueil", label: "Accueil du matin", startTime: "08:00", endTime: "10:00" },
    { roleName: "Buvette", label: "Buvette de midi", startTime: "12:00", endTime: "14:00" },
    { roleName: "Logistique", label: "Installation à annuler après arrivée", startTime: "10:00", endTime: "12:00" },
  ]
  const shifts: Shift[] = []
  for (const definition of definitions) shifts.push(await db.shift.create({ data: { eventId: event.id, date, capacity: 8, ...definition } }))
  const firstNames = ["Aline", "Nicolas", "Léa", "Noah", "Sarah", "Lucas", "Camille"]
  const people: Volunteer[] = []
  for (const [index, firstName] of firstNames.entries()) {
    const id = `video-attendance-person-${index}`
    const data = { firstName, lastName: "Exemple", email: `video.attendance.${index}@example.org` }
    people.push(await db.volunteer.upsert({ where: { id }, create: { id, organizationId: "default", ...data }, update: data }))
  }
  for (const [index, person] of people.entries()) {
    const status = index === 5 ? "requested" : index === 6 ? "waiting" : "active"
    await db.registration.create({ data: {
      eventId: event.id, volunteerId: person.id, shiftId: shifts[index === 4 ? 2 : 0].id, status, checkedInAt: null,
      ...(status === "waiting" ? { waitingPosition: 1 } : {}),
      ...registrationToken.data(`video-attendance-registration-${index}-0001`),
    } })
  }
  await db.registration.create({ data: { eventId: event.id, volunteerId: people[2].id, shiftId: shifts[1].id, status: "active", checkedInAt: null, ...registrationToken.data("video-attendance-lea-second-0001") } })
  const rows = await db.registration.findMany({ where: { eventId: event.id } })
  if (rows.length !== 8 || rows.filter(r => r.status === "active").length !== 6 || rows.some(r => r.checkedInAt !== null) || rows.filter(r => r.volunteerId === people[2].id).length !== 2) throw new Error("Attendance fixture invariants failed")
  console.log("✓ Attendance fixture: six confirmations, Léa on two shifts, request, waitlist, dedicated cancellation shift; zero pre-existing check-ins")
}
