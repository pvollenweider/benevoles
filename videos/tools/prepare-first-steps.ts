// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/** Reset only the independently owned batch-22 onboarding classroom. */
import assert from "node:assert/strict"
import { PrismaClient } from "../../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { verifyProductBuild } from "../lib/product-build"
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video")
  await verifyProductBuild("http://localhost:43102")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) })
  const id = "video-first-steps-batch22", slug = "formation-premiers-pas", email = "video.firststeps.owner@example.org"
  try {
    const fixture = await db.organization.findUnique({ where: { id }, include: { admins: true, volunteers: true, events: { include: { sectorLeaders: true } } } })
    if (fixture) {
      assert(fixture.slug === slug && fixture.name === "Association Les Amis du Parc")
      assert(fixture.admins.length === 1 && fixture.admins[0].email === email)
      assert(fixture.events.every(event => event.title === "Fête du parc" && event.sectorLeaders.length === 0))
      assert(fixture.volunteers.every(person => person.email === "alex.masterclass@example.org" && person.firstName === "Alex" && person.lastName === "Martin"))
      await db.event.deleteMany({ where: { organizationId: id } })
      await db.volunteer.deleteMany({ where: { organizationId: id } })
      await db.orgLog.deleteMany({ where: { organizationId: id } })
      await db.organization.update({ where: { id }, data: { publicTitle: null, volunteerCharter: null, timeZone: null, onboardingDismissedAt: null } })
    } else {
      assert.equal(await db.organization.count({ where: { slug } }), 0)
      const source = await db.adminUser.findFirstOrThrow({ where: { organizationId: "default", email: "elodie.rochat@example.org" }, select: { passwordHash: true } })
      await db.organization.create({ data: { id, slug, name: "Association Les Amis du Parc", active: true, hasOrgInsurance: true } })
      await db.adminUser.create({ data: { id: `${id}-owner`, organizationId: id, email, name: "Camille Berger", passwordHash: source.passwordHash, role: "admin", isActive: true } })
    }
    console.log("Owned empty first-steps classroom ready; no other organization changed.")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "First-steps seed failed"); process.exitCode = 1 })
