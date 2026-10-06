// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient, Shift, Volunteer } from "../src/generated/prisma/client"
import { registrationToken, linkToken } from "../src/lib/token-vault"

/** Shared, repeatable report/badge fixture. Called only by the guarded video seed. */
export async function seedVideoDocuments(db: PrismaClient) {
  const slug = "festival-des-documents"
  await db.event.deleteMany({ where: { organizationId: "default", slug } })
  const dates = [new Date("2026-10-10T00:00:00Z"), new Date("2026-10-11T00:00:00Z")]
  const event = await db.event.create({ data: {
    organizationId: "default", slug, title: "Fête des associations — documents terrain",
    startDate: dates[0], endDate: dates[1], publicStatus: "published", remindersEnabled: false,
    location: "Parc de Montvert, entrée nord", latitude: 46.2, longitude: 6.14,
    accentColorKey: "blue", description: "Données fictives pour apprendre à préparer les documents du jour J.",
  } })
  const definitions = [
    ["Accueil", "Accueil du matin", 0, "08:00", "10:00", "blue"],
    ["Buvette", "Buvette du matin", 0, "10:00", "12:00", "amber"],
    ["Accueil", "Accueil de midi", 0, "12:00", "14:00", "blue"],
    ["Buvette", "Buvette de l'après-midi", 0, "14:00", "16:00", "amber"],
    ["Loge", "Accueil des artistes", 0, "16:00", "18:00", null],
    ["Loge", "Rangement de nuit", 0, "22:00", "02:00", null],
    ["Accueil", "Accueil du dimanche", 1, "08:00", "10:00", "blue"],
    ["Buvette", "Buvette du dimanche", 1, "10:00", "12:00", "amber"],
    ["Loge", "Retour du matériel", 1, "12:00", "14:00", null],
  ] as const
  const shifts: Shift[] = []
  for (const [roleName, label, day, startTime, endTime, colorKey] of definitions) shifts.push(await db.shift.create({ data: {
    eventId: event.id, roleName, label, date: dates[day], startTime, endTime, capacity: 20,
    colorKey, displayOrder: ["Accueil", "Buvette", "Loge"].indexOf(roleName),
    locationDetails: roleName === "Buvette" ? "Stand bleu, près de la fontaine" : "Entrée nord du parc",
    contactName: "Élodie Perrin", contactPhone: "079 000 00 10", instructions: "Arrive quinze minutes avant. Prends une gourde.",
  } }))
  const people: Volunteer[] = []
  for (let index = 0; index < 83; index++) {
    const name = index === 0 ? { firstName: "Léa", lastName: "Giroud" }
      : index === 1 || index === 2 ? { firstName: "Camille", lastName: "Berger" }
      : index === 3 ? { firstName: "Jean-Baptiste", lastName: "de la Fontaine-Montvert" }
      : index === 4 ? { firstName: "Marie-Charlotte", lastName: "Vollenweider-Lachenal" }
      : index >= 80 ? { firstName: ["Demande", "Attente", "Annulée"][index - 80], lastName: "Témoin" }
      : { firstName: ["Aline", "Nicolas", "Zoé", "Sarah", "Étienne", "Noah", "Manon", "Sébastien"][index % 8], lastName: `Montvert ${String(index + 1).padStart(2, "0")}` }
    const data = { ...name, email: `video.documents.${String(index).padStart(3, "0")}@example.org`, phone: `+41 79 000 ${String(index).padStart(4, "0")}` }
    people.push(await db.volunteer.upsert({ where: { id: `video-document-person-${index}` }, create: { id: `video-document-person-${index}`, organizationId: "default", ...data }, update: data }))
  }
  for (const [index, person] of people.entries()) {
    const status = index < 80 ? "active" : ["requested", "waiting", "cancelled"][index - 80]
    await db.registration.create({ data: {
      eventId: event.id, volunteerId: person.id, shiftId: shifts[index % shifts.length].id, status,
      ...(status === "waiting" ? { waitingPosition: 1 } : {}),
      ...(index === 0 ? { phone: "+41 79 000 99 99" } : {}),
      checkedInAt: index >= 5 && index < 11 ? new Date("2026-10-10T06:02:00Z") : null,
      comment: index === 3 ? "Préfère être près de l'entrée." : null,
      ...registrationToken.data(`demo-documents-${index}-0001`),
    } })
  }
  // Five non-overlapping confirmed shifts: a badge must abbreviate, an individual sheet must not.
  for (let index = 1; index < 5; index++) await db.registration.create({ data: { eventId: event.id, volunteerId: people[0].id, shiftId: shifts[index].id, status: "active", ...registrationToken.data(`demo-documents-lea-extra-${index}-0001`) } })
  await db.sectorLeader.create({ data: { eventId: event.id, roleName: "Buvette", name: "Élodie Perrin", email: "video.documents.leader@example.org", ...linkToken.data("demo-documents-leader-0001") } })
  const questions = [
    { label: "Taille du t-shirt", type: "single", options: ["S", "M", "L", "XL"], position: 0 },
    { label: "Régime alimentaire", type: "single", options: ["Sans particularité", "Végétarien", "Sans gluten"], position: 1 },
  ]
  for (const definition of questions) {
    const question = await db.eventQuestion.create({ data: { eventId: event.id, ...definition } })
    await db.questionAnswer.createMany({ data: people.slice(0, 80).map((person, index) => ({ eventId: event.id, questionId: question.id, volunteerId: person.id, values: [definition.options[index % definition.options.length]] })) })
  }
  const regs = await db.registration.findMany({ where: { eventId: event.id }, include: { volunteer: true, shift: true } })
  const active = regs.filter(r => r.status === "active")
  const distinct = new Set(active.map(r => r.volunteerId))
  const lea = active.filter(r => r.volunteerId === people[0].id)
  if (distinct.size !== 80 || active.length !== 84 || lea.length !== 5 || new Set(lea.map(r => r.shift.roleName)).size !== 3 || regs.filter(r => r.status !== "active").length !== 3 || await db.questionAnswer.count({ where: { eventId: event.id } }) !== 160) throw new Error("Document fixture invariants failed")
  console.log("✓ Document fixture: 80 distinct confirmed volunteers, 84 confirmations, five shifts for Léa across three roles, two homonyms, long names, six prior check-ins, three excluded witnesses and 160 real question answers")
}
