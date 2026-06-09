/**
 * One-shot sync: for every active registration, upsert the volunteer as a Member
 * in the corresponding organization. New members get tag "Bénévole".
 *
 * Usage: npx tsx scripts/sync-volunteers-to-members.ts
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const registrations = await prisma.registration.findMany({
    where: { status: { in: ["active", "waiting"] } },
    select: {
      volunteer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      event:     { select: { organizationId: true } },
    },
    distinct: ["volunteerId", "eventId"],
  })

  console.log(`Found ${registrations.length} volunteer/event pairs`)

  let created = 0
  let updated = 0

  for (const reg of registrations) {
    const { firstName, lastName, email, phone } = reg.volunteer
    const { organizationId } = reg.event

    const existing = await prisma.member.findUnique({
      where: { organizationId_email: { organizationId, email } },
      select: { id: true },
    })

    if (existing) {
      await prisma.member.update({
        where: { id: existing.id },
        data: { firstName, lastName, phone: phone ?? undefined },
      })
      updated++
    } else {
      await prisma.member.create({
        data: { organizationId, firstName, lastName, email, phone, tags: ["Bénévole"] },
      })
      created++
    }
  }

  console.log(`Done — ${created} created, ${updated} updated`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
