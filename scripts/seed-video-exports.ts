// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken, linkToken } from "../src/lib/token-vault"

/** Dedicated export classroom; never resets another video's organization. */
export async function seedVideoExports(db: PrismaClient) {
  const organizationId = "video-data-exports"
  const slug = "formation-exports"
  const name = "Formation — données et archives"
  const existing = await db.organization.findUnique({ where: { id: organizationId } })
  if (existing && (existing.slug !== slug || existing.name !== name)) throw new Error("Export organization is not the recorder-owned fixture")
  const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
  // Exact checked fixture only; cascade removes its objects, never the shared demo.
  if (existing) await db.organization.delete({ where: { id: organizationId } })
  await db.organization.create({ data: { id: organizationId, slug, name, timeZone: "Europe/Zurich", active: true } })
  await db.adminUser.create({ data: { id: "video-data-exports-owner", organizationId, name: "Élodie Exemple", email: "video.exports.owner@example.org", passwordHash: source.passwordHash, role: "admin", isActive: true } })
  const people = [
    { firstName: "Léa", lastName: "Exemple", active: true, notes: "=1+1", tags: ["Accueil", "Équipe fidèle"], availabilityPeriods: ["morning"], availabilityNote: "Disponible le matin ; retour à midi." },
    { firstName: "Étienne", lastName: "Exemple", active: false, notes: "Fiche désactivée — exemple fictif.", tags: ["Logistique"], availabilityPeriods: [], availabilityNote: "" },
    { firstName: "Zoé", lastName: "Exemple", active: true, notes: "Prévenir à l'arrivée.", tags: ["Accueil"], availabilityPeriods: ["afternoon"], availabilityNote: "Après le repas." },
    { firstName: "Camille", lastName: "Exemple", active: true, notes: "@exemple", tags: [], availabilityPeriods: [], availabilityNote: "" },
  ]
  const members = []
  for (const [index, person] of people.entries()) members.push(await db.volunteer.create({ data: { id: `video-data-exports-member-${index}`, organizationId, ...person, email: `video.exports.member.${index}@example.org`, phone: `+41 79 000 ${String(index).padStart(4, "0")}`, birthDate: index === 0 ? new Date("2000-06-15T00:00:00Z") : null } }))
  const event = await db.event.create({ data: { id: "video-data-exports-event", organizationId, slug: "fete-des-archives", title: "Fête des archives — démonstration", startDate: new Date("2026-10-17T00:00:00Z"), endDate: new Date("2026-10-17T00:00:00Z"), publicStatus: "draft", location: "Parc de démonstration", latitude: 46.2, longitude: 6.14, remindersEnabled: false } })
  const shifts = []
  for (const [index, roleName] of ["Accueil", "Logistique"].entries()) shifts.push(await db.shift.create({ data: { eventId: event.id, roleName, label: `${roleName} — archives`, date: event.startDate, startTime: index ? "12:00" : "10:00", endTime: index ? "14:00" : "12:00", capacity: 4, status: "open", instructions: "Passer au stand quinze minutes avant.", internalNotes: "Note de préparation fictive, réservée à l'équipe." } }))
  for (const index of [0, 2, 3]) await db.registration.create({ data: { eventId: event.id, shiftId: shifts[index === 3 ? 1 : 0].id, volunteerId: members[index].id, status: "active", source: "admin_manual", ...registrationToken.data(`demo-video-exports-registration-${index}`) } })
  await db.eventPage.create({ data: { eventId: event.id, slug: "bienvenue", title: "Bienvenue au stand", content: "Informations fictives pour la fête des archives." } })
  await db.sectorLeader.create({ data: { eventId: event.id, roleName: "Accueil", name: "Nicolas Exemple", email: "video.exports.leader@example.org", ...linkToken.data("demo-video-exports-leader") } })
  await db.eventMilestone.create({ data: { eventId: event.id, title: "Préparer les panneaux", dueDate: new Date("2026-10-15T12:00:00Z"), done: true } })
  const question = await db.eventQuestion.create({ data: { eventId: event.id, label: "Taille du t-shirt", type: "single", options: ["S", "M", "L"], required: false } })
  await db.questionAnswer.create({ data: { eventId: event.id, questionId: question.id, volunteerId: members[0].id, values: ["M"] } })
  if (await db.volunteer.count({ where: { organizationId } }) !== 4 || await db.orgLog.count({ where: { organizationId } })) throw new Error("Export fixture invariants failed")
  console.log("✓ Separate export fixture: four members, accents, formula-like notes, inactive member, registrations and populated archive collections; no invented journal")
}
