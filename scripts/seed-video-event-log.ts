// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"

/** No fabricated history or causality: the recorder must create logs through actual routes. */
export async function seedVideoEventLog(db: PrismaClient) {
  const slugs = ["atelier-journal", "atelier-journal-etat-initial"]
  await db.event.deleteMany({ where: { organizationId: "default", slug: { in: slugs } } })
  const date = new Date("2026-10-17T00:00:00Z")
  const people = []
  for (const [index, firstName] of ["Aline", "Nicolas", "Léa"].entries()) {
    const id = `video-event-log-person-${index}`
    const data = { firstName, lastName: "Exemple", email: `video.event-log.${index}@example.org`, phone: null }
    people.push(await db.volunteer.upsert({ where: { id }, create: { id, organizationId: "default", ...data }, update: data }))
  }
  for (const [index, slug] of slugs.entries()) {
    const event = await db.event.create({ data: {
      organizationId: "default", slug,
      title: index ? "Ancien planning — état initial" : "Comprendre le journal de la fête",
      description: "Données fictives de formation. Historique créé par les actions locales de démonstration.",
      publicStatus: "published", remindersEnabled: false, startDate: date, endDate: date,
    } })
    const shift = await db.shift.create({ data: {
      eventId: event.id, roleName: "Accueil", label: index ? "Accueil sans historique" : "Accueil — chaîne de remplacement",
      date, startTime: "10:00", endTime: "12:00", capacity: 1,
      status: "full", waitlistEnabled: index === 0,
      instructions: "Retrouve le stand bleu quinze minutes avant ton créneau.",
    } })
    await db.registration.create({ data: {
      eventId: event.id, shiftId: shift.id, volunteerId: people[0].id, status: "active", source: "admin_manual",
      ...registrationToken.data(`video-event-log-${index}-active-0001`),
    } })
    if (!index) await db.registration.create({ data: {
      eventId: event.id, shiftId: shift.id, volunteerId: people[1].id, status: "waiting", waitingPosition: 1,
      ...registrationToken.data("video-event-log-waiting-0001"),
    } })
    if (await db.eventLog.count({ where: { eventId: event.id } })) throw new Error("Seed must not invent event history")
  }
  const events = await db.event.findMany({ where: { organizationId: "default", slug: { in: slugs } }, include: { registrations: true } })
  if (events.length !== 2 || events.reduce((sum, event) => sum + event.registrations.length, 0) !== 3) throw new Error("Event log fixture invariants failed")
  console.log("✓ Two isolated fictional event-log fixtures; one occupied shift with waitlist, one without history. No fabricated logs or causal links.")
}
