// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Focused, idempotent datasets for the video masterclass. Never run outside the video DB. */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../src/lib/token-vault"

const scenario = process.argv[2]
if (!scenario) throw new Error("Usage: seed-video-scenario.ts <scenario>")
if (!process.env.DATABASE_URL?.includes("benevoles_video")) {
  throw new Error("Refusing to seed a database whose URL does not contain benevoles_video")
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function freshOrganization() {
  const organizationId = "default"
  await prisma.event.deleteMany({ where: { organizationId } })
  await prisma.volunteer.deleteMany({ where: { organizationId } })
  await prisma.messageTemplate.deleteMany({ where: { organizationId } })
  await prisma.targetedMessage.deleteMany({ where: { organizationId } })
  await prisma.orgLog.deleteMany({ where: { organizationId } })
  await prisma.orgSlugHistory.deleteMany({ where: { organizationId } })
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: "Association Les Amis du Parc",
      slug: "amis-du-parc",
      publicTitle: null,
      volunteerCharter: null,
      timeZone: null,
      replyToEmail: null,
      notificationSettings: undefined,
      onboardingDismissedAt: null,
      hasOrgInsurance: true,
    },
  })
  await prisma.adminUser.updateMany({
    where: { organizationId },
    data: { name: "Camille Berger", isActive: true, role: "admin" },
  })
  console.log("✓ Video scenario fresh-organization: empty organization and visible onboarding")
}

async function main() {
  if (scenario === "fresh-organization") return freshOrganization()
  if (scenario === "members-management") {
    // The demo seed supplies 24 members. Add 36 deterministic fictional members for a
    // substantial list, including two distinct homonyms and a contact without email.
    for (let index = 0; index < 36; index++) {
      const id = `video-member-management-${index}`
      const homonym = index < 2
      const data = {
        organizationId: "default",
        firstName: homonym ? "Stéphane" : ["Aline", "Émilie", "Sébastien", "Anaïs", "Nicolas", "Léon"][index % 6],
        lastName: homonym ? "Favre" : `Morel ${index + 1}`,
        email: index === 2 ? null : `video.membre.${index}@example.org`,
        phone: `079 000 ${String(index).padStart(2, "0")} 00`,
        active: index !== 35,
        tags: index % 2 ? ["accueil"] : ["logistique", "permis-b"],
        notes: index === 2 ? "Contact à joindre par téléphone pour les horaires." : null,
        availabilityPeriods: index % 2 ? ["morning"] : ["evening"],
        availabilityNote: index === 3 ? "Pas le dimanche" : null,
      }
      await prisma.volunteer.upsert({ where: { id }, create: { id, ...data }, update: data })
    }
    const count = await prisma.volunteer.count({ where: { organizationId: "default" } })
    if (count !== 60) throw new Error(`Members scenario expects 60 members after demo seed, got ${count}`)
    console.log("✓ Members scenario: 60 fictional members, homonyms, contact without email and inactive member")
    return
  }
  if (scenario === "personal-session") {
    const camille = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
    await prisma.organization.update({ where: { id: "default" }, data: { replyToEmail: "organisation.montvert@example.org" } })
    await prisma.volunteer.update({ where: { id: camille.id }, data: { availabilityPeriods: [], availabilityNote: null } })
    console.log("✓ Personal session: Camille starts with empty availability preferences")
    return
  }
  if (scenario === "personal-calendar") {
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const camille = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
    const accueil = await prisma.shift.findFirstOrThrow({ where: { eventId: event.id, roleName: "Accueil", startTime: "09:00" } })
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: camille.id, shift: { roleName: "Démontage" } } })
    await prisma.shift.deleteMany({ where: { eventId: event.id, roleName: "Rangement", label: "Rangement de nuit — calendrier" } })
    await prisma.shift.update({ where: { id: accueil.id }, data: { contactName: "Manon Aebi", contactPhone: "079 000 00 03", instructions: "Arrive 15 minutes avant, au stand bleu.", latitude: 46.1805734, longitude: 6.1228285 } })
    const night = await prisma.shift.create({ data: { eventId: event.id, roleName: "Rangement", label: "Rangement de nuit — calendrier", date: accueil.date, startTime: "22:00", endTime: "02:00", capacity: 4, colorKey: "slate", displayOrder: 5, locationDetails: "Hangar communal, entrée nord", instructions: "Gants fournis sur place.", latitude: 46.1805734, longitude: 6.1228285 } })
    await prisma.registration.create({ data: { eventId: event.id, volunteerId: camille.id, shiftId: night.id, status: "active", source: "admin_manual", ...registrationToken.data("demo-calendar-night-camille-0001") } })
    const confirmed = await prisma.registration.count({ where: { eventId: event.id, volunteerId: camille.id, status: "active" } })
    if (confirmed !== 3) throw new Error(`Expected exactly three confirmed calendar shifts, got ${confirmed}`)
    console.log("✓ Calendar scenario: three confirmed shifts including overnight; waiting registration remains excluded from export")
    return
  }
  if (scenario === "personal-withdrawals") {
    const event = await prisma.event.findFirstOrThrow({ where: { organizationId: "default", slug: "fete-du-village" } })
    const camille = await prisma.volunteer.findFirstOrThrow({ where: { organizationId: "default", email: "camille.rochat@example.org" } })
    const shifts = await prisma.shift.findMany({ where: { eventId: event.id }, orderBy: { date: "asc" } })
    const accueil = shifts.find(s => s.roleName === "Accueil" && s.startTime === "09:00")!
    const offer = shifts.find(s => s.roleName === "Buvette" && s.startTime === "18:00")!
    if (!accueil || !offer) throw new Error("Run demo seed before personal-withdrawals")
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: camille.id, status: { in: ["offered", "requested"] } } })
    await prisma.shift.deleteMany({ where: { eventId: event.id, roleName: "Navette", label: "Navette du dimanche" } })
    await prisma.registration.deleteMany({ where: { eventId: event.id, volunteerId: camille.id, status: "active", shiftId: { not: accueil.id } } })
    await prisma.shift.update({ where: { id: accueil.id }, data: { contactName: "Manon Aebi", contactPhone: "079 000 00 03", instructions: "Arrive 15 minutes avant, au stand bleu.", latitude: 46.1805734, longitude: 6.1228285 } })
    const sunday = shifts.find(s => s.roleName === "Démontage")!.date
    const request = await prisma.shift.create({ data: { eventId: event.id, roleName: "Navette", label: "Navette du dimanche", date: sunday, startTime: "08:00", endTime: "10:00", capacity: 2, requiresApproval: true, colorKey: "violet", displayOrder: 3 } })
    await prisma.registration.create({ data: { eventId: event.id, volunteerId: camille.id, shiftId: offer.id, status: "offered", source: "public_form", waitingExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), ...registrationToken.data("demo-offer-camille-0001") } })
    await prisma.registration.create({ data: { eventId: event.id, volunteerId: camille.id, shiftId: request.id, status: "requested", source: "public_form", ...registrationToken.data("demo-request-camille-0001") } })
    console.log("✓ Personal withdrawals: Camille has active, waiting, offered and requested registrations without overlapping shifts")
    return
  }
  throw new Error(`Unknown video scenario: ${scenario}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
