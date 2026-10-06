// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Create once; never reset or overwrite another video's data. */
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video", "Dedicated local video database required")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  const orgId = "video-accessibility", eventId = `${orgId}-event`
  try {
    assert.equal(await db.organization.count({ where: { OR: [{ id: orgId }, { slug: "formation-clavier" }] } }), 0, "Accessibility fixture already exists: refusing overwrite")
    const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
    const date = new Date("2026-11-07T00:00:00Z")
    const definitions = [
      ["Accueil", "Accueil du matin", "10:00", "12:00"],
      ["Vestiaire", "Vestiaire des artistes, entrée nord", "11:00", "13:00"],
      ["Caisse", "Caisse du stand", "14:00", "16:00"],
      ["Accueil et accompagnement des équipes invitées", "Rendez-vous à l'entrée principale", "16:00", "18:00"],
      ["Accueil", "Accueil de l'après-midi", "14:00", "16:00"],
    ]
    await db.$transaction(async tx => {
      await tx.organization.create({ data: { id: orgId, slug: "formation-clavier", name: "Formation — clavier et affichage", timeZone: "Europe/Zurich", active: true, replyToEmail: "video.accessibility.owner@example.org", hasOrgInsurance: true } })
      await tx.adminUser.create({ data: { id: `${orgId}-owner`, organizationId: orgId, name: "Élodie Exemple", email: "video.accessibility.owner@example.org", passwordHash: source.passwordHash, role: "admin", isActive: true } })
      for (const [index, firstName] of ["Aline", "Emma", "Nicolas", "Zoé", "Sarah"].entries()) await tx.volunteer.create({ data: { id: `${orgId}-member-${index}`, organizationId: orgId, firstName, lastName: "Exemple", email: `video.accessibility.${index}@example.org`, active: true, notes: "Données fictives de formation uniquement." } })
      await tx.event.create({ data: { id: eventId, organizationId: orgId, slug: "atelier-clavier", title: "Un planning accessible — démonstration", description: "Données fictives de formation uniquement.", startDate: date, endDate: date, publicStatus: "published", isListed: false, remindersEnabled: false } })
      for (const [index, [roleName, label, startTime, endTime]] of definitions.entries()) await tx.shift.create({ data: { id: `${orgId}-shift-${index}`, eventId, roleName, label, date, startTime, endTime, capacity: 3, status: "open", displayOrder: index === 4 ? 0 : index, requiresApproval: index === 2, instructions: "Retrouve le stand quinze minutes avant ton créneau." } })
      for (const [index, shiftIndex, status] of [[0, 0, "active"], [1, 2, "requested"]] as const) await tx.registration.create({ data: { id: `${orgId}-registration-${index}`, eventId, shiftId: `${orgId}-shift-${shiftIndex}`, volunteerId: `${orgId}-member-${index}`, status, source: "admin_manual", ...registrationToken.data(`demo-accessibility-registration-${index}`) } })
    })
    const shifts = await db.shift.findMany({ where: { eventId } })
    assert.equal(shifts.length, 5)
    assert.equal(new Set(shifts.map(shift => shift.roleName)).size, 4)
    assert.equal(await db.volunteer.count({ where: { organizationId: orgId } }), 5)
    assert.equal(await db.registration.count({ where: { eventId } }), 2)
    assert(shifts.find(shift => shift.id.endsWith("-0"))!.endTime > shifts.find(shift => shift.id.endsWith("-1"))!.startTime)
    const directory = path.resolve("videos/output/accessibility-keyboard-display")
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "preparation.json"), JSON.stringify({ preparedAt: new Date().toISOString(), organizationId: orgId, eventId, members: 5, roles: 4, shifts: 5, registrations: 2, actualOverlap: true, nativeZoomRecorded: false, screenReaderRecorded: false, captureReady: false }, null, 2))
    console.log("✓ Separate synthetic accessibility organization created: four roles, five slots, actual overlap, confirmed registration and pending request. No email sent or native check claimed.")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Accessibility preparation failed"); process.exitCode = 1 })
