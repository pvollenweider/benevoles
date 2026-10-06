// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"

/** Two recorder-owned organizations, never the shared demonstration organization. */
export async function seedVideoPrivacy(db: PrismaClient) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Isolated local video database required")
  const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
  // Observed loopback counters in the isolated video DB only. Repeated preflights
  // otherwise consume the same limits as the filmed take; application limits stay intact.
  await db.rateLimit.deleteMany({ where: { key: { in: [
    "reg-link-request:::1", "reg-link-request:127.0.0.1",
    "reg-token-read:127.0.0.1", "reg-link-resend:video-privacy-a-member-0",
  ] } } })
  const day = new Date("2026-10-24T00:00:00Z")
  for (const side of ["a", "b"] as const) {
    const organizationId = `video-privacy-${side}`
    const slug = `formation-confidentialite-${side}`
    const name = `Formation — confidentialité ${side.toUpperCase()}`
    const ownerId = `${organizationId}-owner`, email = `video.privacy.${side}.owner@example.org`
    const existing = await db.organization.findUnique({ where: { id: organizationId } })
    if (existing && (existing.slug !== slug || existing.name !== name)) throw new Error("Privacy fixture organization belongs to another namespace")
    const owner = await db.adminUser.findUnique({ where: { id: ownerId } })
    if (owner && (owner.email !== email || (owner.organizationId !== null && owner.organizationId !== organizationId))) throw new Error("Privacy fixture owner belongs to another namespace")
    const ids = Array.from({ length: 5 }, (_, index) => `${organizationId}-member-${index}`)
    const retained = await db.volunteer.findMany({ where: { id: { in: ids } } })
    if (retained.some(person => (person.organizationId !== null && person.organizationId !== organizationId) || !person.email?.startsWith(`video.privacy.${side}.member.`))) throw new Error("Privacy fixture member belongs to another namespace")
    const newPeople = await db.volunteer.findMany({ where: { email: `video.privacy.${side}.new@example.org` } })
    if (newPeople.some(person => person.firstName !== "Jules" || person.lastName !== "Exemple" || (person.organizationId !== null && person.organizationId !== organizationId))) throw new Error("Privacy signup fixture belongs to another namespace")
    await db.notificationOutbox.deleteMany({ where: { organizationId } })
    if (existing) await db.organization.delete({ where: { id: organizationId } })
    await db.volunteer.deleteMany({ where: { id: { in: ids } } })
    await db.volunteer.deleteMany({ where: { id: { in: newPeople.map(person => person.id) } } })
    if (owner) await db.adminUser.delete({ where: { id: ownerId } })
    await db.organization.create({ data: { id: organizationId, slug, name, active: true, timeZone: "Europe/Zurich", hasOrgInsurance: true, replyToEmail: email, notificationSettings: { reminders: { j2: false, j1: false, dd: false } } } })
    await db.adminUser.create({ data: { id: ownerId, organizationId, name: side === "a" ? "Élodie Exemple" : "Colette Exemple", email, passwordHash: source.passwordHash, role: "admin", isActive: true } })
    const people = []
    for (const [index, firstName] of ["Léa", "Emma", "Nicolas", "Zoé", "Sarah"].entries()) people.push(await db.volunteer.create({ data: {
      id: ids[index], organizationId, firstName, lastName: "Exemple", active: true,
      email: `video.privacy.${side}.member.${index}@example.org`, phone: `+41 79 000 ${side === "a" ? "1" : "2"}${String(index).padStart(3, "0")}`,
      notes: index === 0 ? `Note interne fictive — organisation ${side.toUpperCase()}` : "Exemple de formation uniquement.",
      availabilityPeriods: ["morning"], availabilityNote: "Disponible le matin, à confirmer pour chaque mission.",
    } }))
    const event = await db.event.create({ data: { id: `${organizationId}-event`, organizationId, slug: "fete-des-liens", title: `Fête des liens — organisation ${side.toUpperCase()}`, startDate: day, endDate: day, publicStatus: "published", isListed: true, remindersEnabled: false, location: "Parc de démonstration" } })
    const shifts = []
    for (const [index, roleName] of ["Accueil", "Logistique"].entries()) shifts.push(await db.shift.create({ data: { id: `${organizationId}-shift-${index}`, eventId: event.id, roleName, label: `${roleName} — équipe ${side.toUpperCase()}`, date: day, startTime: index ? "14:00" : "10:00", endTime: index ? "16:00" : "12:00", capacity: 8, status: "open", instructions: "Se présenter au stand quinze minutes avant." } }))
    const question = await db.eventQuestion.create({ data: { id: `${organizationId}-question`, eventId: event.id, label: "Taille du t-shirt", type: "single", options: ["S", "M", "L"], required: false } })
    for (const index of [0, 1, 2, 4]) {
      await db.registration.create({ data: { id: `${organizationId}-registration-${index}`, eventId: event.id, volunteerId: people[index].id, shiftId: shifts[index < 2 ? 0 : 1].id, status: "active", source: "public_form", comment: "Je passe au stand avant mon créneau — exemple fictif.", ...registrationToken.data(`demo-privacy-${side}-registration-${index}`) } })
      await db.questionAnswer.create({ data: { eventId: event.id, questionId: question.id, volunteerId: people[index].id, values: [index === 0 ? "M" : "L"] } })
    }
    if (await db.registration.count({ where: { eventId: event.id } }) !== 4 || await db.volunteer.count({ where: { organizationId } }) !== 5 || await db.eventLog.count({ where: { eventId: event.id } })) throw new Error("Privacy fixture invariants failed")
  }
  console.log("✓ Two isolated privacy organizations: homonyms with different addresses, same event slug, two populated roles, answers and internal notes; no invented messages or journal")
}
