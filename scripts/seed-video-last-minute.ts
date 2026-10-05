// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"

export async function seedVideoLastMinute(db: PrismaClient) {
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Isolated local video database required")
  const organizationId = "video-last-minute", slug = "formation-imprevus", name = "Formation — imprévus"
  const existing = await db.organization.findUnique({ where: { id: organizationId } })
  if (existing && (existing.slug !== slug || existing.name !== name)) throw new Error("Last-minute organization is not the recorder-owned fixture")
  const owner = await db.adminUser.findUnique({ where: { id: "video-last-minute-owner" } })
  if (owner && (owner.email !== "video.last-minute.owner@example.org" || (owner.organizationId !== null && owner.organizationId !== organizationId))) throw new Error("Fixture owner belongs to another namespace")
  const fixtureIds = Array.from({ length: 6 }, (_, index) => `video-last-minute-person-${index}`)
  const retainedPeople = await db.volunteer.findMany({ where: { id: { in: fixtureIds } } })
  if (retainedPeople.some(person => (person.organizationId !== null && person.organizationId !== organizationId) || !person.email?.startsWith("video.last-minute.person."))) throw new Error("Fixture person belongs to another namespace")
  const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
  // Outbox rows are retained independently of organization deletion. Remove only
  // this fixture's notifications so deterministic demo IDs get fresh deliveries.
  await db.notificationOutbox.deleteMany({ where: { organizationId } })
  // Repeated real withdrawals hit the application's five-per-hour limiter.
  // Reset only the observed loopback read/withdrawal buckets in this local test DB.
  await db.rateLimit.deleteMany({ where: { key: { in: ["reg-token-delete:::1", "reg-token-read:::1"] } } })
  if (existing) await db.organization.delete({ where: { id: organizationId } })
  await db.volunteer.deleteMany({ where: { id: { in: fixtureIds } } })
  // Organization deletion retains administrators with a null organizationId.
  if (owner) await db.adminUser.delete({ where: { id: owner.id } })
  await db.organization.create({ data: { id: organizationId, slug, name, active: true, timeZone: "Europe/Zurich", notificationSettings: { reminders: { j2: false, j1: false, dd: false } } } })
  await db.adminUser.create({ data: { id: "video-last-minute-owner", organizationId, name: "Colette Exemple", email: "video.last-minute.owner@example.org", passwordHash: source.passwordHash, role: "admin", isActive: true } })
  const firstNames = ["Aline", "Nicolas", "Zoé", "Emma", "Sarah", "Lucas"]
  const people = []
  for (const [index, firstName] of firstNames.entries()) people.push(await db.volunteer.create({ data: { id: `video-last-minute-person-${index}`, organizationId, firstName, lastName: "Exemple", email: `video.last-minute.person.${index}@example.org`, phone: `+41 79 000 ${String(index).padStart(4, "0")}`, ...(index === 2 ? { availabilityPeriods: ["morning"], availabilityNote: "Peut aussi aider en début d'après-midi après confirmation." } : {}) } }))
  const day = new Date("2026-10-17T00:00:00Z")
  const event = await db.event.create({ data: { id: "video-last-minute-event", organizationId, slug: "fete-des-imprevus", title: "Fête des imprévus — démonstration", startDate: day, endDate: day, publicStatus: "published", remindersEnabled: false, location: "Parc de démonstration", isListed: false } })
  const definitions = [
    { roleName: "Accueil", label: "Accueil du matin", startTime: "10:00", endTime: "12:00", capacity: 1, waitlistEnabled: true },
    { roleName: "Logistique", label: "Installation du matériel", startTime: "12:00", endTime: "14:00", capacity: 2 },
    { roleName: "Préparation", label: "Réception du matériel", startTime: "14:00", endTime: "16:00", capacity: 3 },
    { roleName: "Caisse", label: "Caisse de la petite scène", startTime: "16:00", endTime: "18:00", capacity: 2, requiresApproval: true },
    { roleName: "Accueil", label: "Accueil du soir", startTime: "18:00", endTime: "20:00", capacity: 1 },
  ]
  const shifts = []
  for (const [index, definition] of definitions.entries()) shifts.push(await db.shift.create({ data: { id: `video-last-minute-shift-${index}`, eventId: event.id, date: day, ...definition, status: index === 0 || index === 4 ? "full" : "open", locationDetails: "Entrée nord du parc", instructions: "Passer au stand quinze minutes avant le début." } }))
  const registrations = [
    { person: 0, shift: 0, status: "active" }, { person: 1, shift: 0, status: "waiting" },
    { person: 3, shift: 1, status: "active" }, { person: 4, shift: 2, status: "active" },
    { person: 5, shift: 2, status: "requested" }, { person: 0, shift: 3, status: "active" },
    { person: 5, shift: 3, status: "requested" }, { person: 2, shift: 4, status: "active" },
  ]
  for (const [index, definition] of registrations.entries()) await db.registration.create({ data: { id: `video-last-minute-registration-${index}`, eventId: event.id, volunteerId: people[definition.person].id, shiftId: shifts[definition.shift].id, status: definition.status, source: "public_form", ...(definition.status === "waiting" ? { waitingPosition: 1 } : {}), checkedInAt: index === 5 ? new Date("2026-10-17T14:02:00Z") : null, ...registrationToken.data(`demo-last-minute-registration-${index}`) } })
  if (await db.registration.count({ where: { eventId: event.id } }) !== 8 || await db.eventLog.count({ where: { eventId: event.id } })) throw new Error("Last-minute fixture invariants failed")
  console.log("✓ Separate last-minute fixture: actual occupied/waiting states, underfilled role, availability, pending requests and prior attendance; no invented journal")
}
