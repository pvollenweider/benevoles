// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** Focused, idempotent datasets for the video masterclass. Never run outside the video DB. */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

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
  throw new Error(`Unknown video scenario: ${scenario}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
