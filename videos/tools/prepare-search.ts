// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../../src/lib/token-vault"
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) })
  const id = "video-search-current"
  try {
    if (await db.organization.findUnique({ where: { id } })) {
      assert.equal(await db.volunteer.count({ where: { organizationId: id } }), 26)
      console.log("Owned search fixture retained; no reset.")
      return
    }
    const source = await db.adminUser.findUniqueOrThrow({ where: { id: "video-navigation-current-owner" }, select: { passwordHash: true } })
    await db.$transaction(async tx => {
      await tx.organization.create({ data: { id, slug: "formation-recherche", name: "Les amis de Montvert", active: true, timeZone: "Europe/Zurich" } })
      await tx.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, name: "Camille Martin", email: "video.search.owner@example.org", passwordHash: source.passwordHash, role: "admin", isActive: true } })
      const firstNames = ["Léa", "Nicolas", "Alex", "Emma", "Sarah", "Julie", "Louis", "Hugo", "Noé", "Anna", "Paul", "Émile", "Jules", "Lucie", "Rose", "Éva", "Alice", "Arthur", "Gabriel", "Mia", "Nathan", "Louise", "Manon", "Sophie", "Zoé", "Daniel"]
      for (const [index, firstName] of firstNames.entries()) await tx.volunteer.create({ data: { id: `${id}-member-${index}`, organizationId: id, firstName, lastName: index < 24 ? "Morel" : "Perrin", email: `video.search.${index}@example.org`, active: true, notes: "Personne fictive de formation." } })
      for (const [index, title] of ["Fête du village de Montvert", "Marché solidaire"].entries()) {
        const eventId = `${id}-event-${index}`, date = new Date(`2026-11-${14 + index * 7}T00:00:00Z`)
        await tx.event.create({ data: { id: eventId, organizationId: id, title, slug: `rencontre-${index}`, description: "Événement fictif de formation.", startDate: date, endDate: date, publicStatus: "published", isListed: true, remindersEnabled: false } })
        for (const [order, roleName] of ["Accueil", "Buvette"].entries()) await tx.shift.create({ data: { id: `${eventId}-shift-${order}`, eventId, date, roleName, label: order ? index ? "Service du marché" : "Midi — village" : "Entrée principale", startTime: order ? "14:00" : "10:00", endTime: order ? "16:00" : "12:00", capacity: 4, status: "open", displayOrder: order } })
      }
      for (const [index, status] of ["active", "waiting"].entries()) await tx.registration.create({ data: { id: `${id}-registration-${index}`, eventId: `${id}-event-0`, shiftId: `${id}-event-0-shift-${index}`, volunteerId: `${id}-member-0`, status, ...(status === "waiting" ? { waitingPosition: 1 } : {}), ...registrationToken.data(`demo-video-search-registration-${index}`) } })
    })
    console.log("Owned synthetic search fixture: 26 members, 24 shared surnames, two events, confirmation and waitlist. No message sent.")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Search preparation failed"); process.exitCode = 1 })
