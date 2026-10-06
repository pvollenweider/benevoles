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
  const id = "video-navigation-current"
  try {
    const existing = await db.organization.findUnique({ where: { id } })
    if (existing) {
      assert.equal(existing.slug, "formation-navigation")
      assert.equal(await db.event.count({ where: { organizationId: id } }), 3)
      const pastDate = new Date("2026-09-21T00:00:00Z")
      await db.$transaction(async tx => {
        await tx.event.update({ where: { id: `${id}-event-2` }, data: { startDate: pastDate, endDate: pastDate, publicStatus: "published" } })
        await tx.shift.updateMany({ where: { eventId: `${id}-event-2` }, data: { date: pastDate } })
        for (let index = 0; index < 3; index++) await tx.shift.update({ where: { id: `${id}-event-${index}-shift-1` }, data: { label: index === 0 ? "Midi — village" : index === 1 ? "Service du marché" : "Service du repas" } })
        await tx.registration.upsert({ where: { id: `${id}-registration-0` }, update: {}, create: { id: `${id}-registration-0`, eventId: `${id}-event-0`, shiftId: `${id}-event-0-shift-1`, volunteerId: `${id}-member-0`, status: "active", source: "admin_manual", ...registrationToken.data("demo-video-navigation-registration-0") } })
      })
      console.log("Owned fixture retained and aligned: draft, published and finished events; distinct shift labels. No deletion.")
      return
    }
    const owner = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, select: { passwordHash: true } })
    await db.$transaction(async tx => {
      await tx.organization.create({ data: { id, slug: "formation-navigation", name: "Les amis de Montvert", timeZone: "Europe/Zurich", active: true, hasOrgInsurance: true } })
      await tx.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, email: "video.navigation.owner@example.org", name: "Camille Martin", passwordHash: owner.passwordHash, role: "admin", isActive: true } })
      for (const [index, title] of ["Fête du village de Montvert", "Marché solidaire", "Repas de l’association"].entries()) {
        const eventId = `${id}-event-${index}`
        const date = new Date(index === 2 ? "2026-09-21T00:00:00Z" : `2026-11-${14 + index * 7}T00:00:00Z`)
        await tx.event.create({ data: { id: eventId, organizationId: id, title, slug: `rencontre-${index}`, description: "Événement fictif de formation.", startDate: date, endDate: date, publicStatus: index === 1 ? "draft" : "published", isListed: true, remindersEnabled: false } })
        for (const [order, roleName] of ["Accueil", "Buvette", "Rangement"].entries()) await tx.shift.create({ data: { id: `${eventId}-shift-${order}`, eventId, date, roleName, label: ["Entrée principale", index === 0 ? "Midi — village" : index === 1 ? "Service du marché" : "Service du repas", "Salle principale"][order], startTime: "10:00", endTime: "12:00", capacity: 4, status: "open", displayOrder: order } })
      }
      for (const [index, [firstName, lastName]] of [["Léa", "Morel"], ["Nicolas", "Roux"], ["Zoé", "Martin"], ["Alex", "Dubois"]].entries()) await tx.volunteer.create({ data: { id: `${id}-member-${index}`, organizationId: id, firstName, lastName, email: `video.navigation.${index}@example.org`, active: true, notes: "Personne fictive de formation." } })
      await tx.registration.create({ data: { id: `${id}-registration-0`, eventId: `${id}-event-0`, shiftId: `${id}-event-0-shift-1`, volunteerId: `${id}-member-0`, status: "active", source: "admin_manual", ...registrationToken.data("demo-video-navigation-registration-0") } })
    })
    console.log("Owned navigation fixture created: three events, nine slots, four fictional members; no email sent.")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Navigation preparation failed"); process.exitCode = 1 })
