// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Demo of the « Jour J » page (#561) for the documentation screenshots: an event of the
 * « Épicerie de la Gare » (scripts/seed-demo-permanences.ts, run it first) taking place today,
 * with a shift already over, one running and one starting within the next hours, some people
 * already marked present.
 *
 * The page shows what runs around the current time, so the shift times are relative to the hour
 * this script runs: run it right before `ONLY=admin-day-of npm run screenshots`, during the day.
 * The village fête of scripts/seed-demo.ts is left untouched. Idempotent: the event is deleted and
 * recreated. Every name and phone number is invented.
 *   DATABASE_URL=… npx tsx scripts/seed-demo-day-of.ts
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../src/lib/token-vault"

export const DEMO_DAY_OF_EVENT_SLUG = "inventaire"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// Not imported from seed-demo-permanences.ts: importing it would run that seed.
const DEMO_PERMANENCES_ORG_SLUG = "epicerie-de-la-gare"
const TIME_ZONE = "Europe/Zurich"

/** Local date (YYYY-MM-DD) and hour of an instant in the organization's zone. */
function local(instant: Date): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

/** A shift starting `from` hours after the current hour and lasting `hours`, dated on its start day. */
function slot(from: number, hours: number) {
  const now = new Date()
  const start = local(new Date(now.getTime() + from * 3600_000))
  const end = local(new Date(now.getTime() + (from + hours) * 3600_000))
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`
  return { date: new Date(`${start.date}T00:00:00Z`), startTime: hh(start.hour), endTime: hh(end.hour) }
}

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: DEMO_PERMANENCES_ORG_SLUG } })
  if (!org) throw new Error("Run scripts/seed-demo-permanences.ts first")
  await prisma.event.deleteMany({ where: { organizationId: org.id, slug: DEMO_DAY_OF_EVENT_SLUG } })

  const today = new Date(`${local(new Date()).date}T00:00:00Z`)
  const event = await prisma.event.create({
    data: {
      organizationId: org.id, slug: DEMO_DAY_OF_EVENT_SLUG, title: "Inventaire d'automne", location: "Rue de la Gare 12",
      publicStatus: "published", startDate: today, endDate: today, remindersEnabled: false,
    },
  })
  const volunteers = await prisma.volunteer.findMany({ where: { organizationId: org.id }, orderBy: { firstName: "asc" } })
  if (volunteers.length < 7) throw new Error("Run scripts/seed-demo-permanences.ts first")
  const [aline, bastien, celine, david, elsa, fabien, gaelle] = volunteers

  // Minus the current minutes: « now » sits inside the running shift whatever the minute.
  const shifts = [
    { roleName: "Comptage en rayon", ...slot(-3, 2), capacity: 2, people: [[aline, true], [bastien, true]] },
    { roleName: "Comptage en rayon", ...slot(-1, 3), capacity: 3, people: [[celine, true], [david, false]], contactName: "Aline Dupraz", contactPhone: "079 444 12 34" },
    { roleName: "Saisie des comptages", ...slot(1, 2), capacity: 2, people: [[elsa, false], [fabien, false]] },
    { roleName: "Saisie des comptages", ...slot(2, 2), capacity: 2, people: [[gaelle, false]] },
  ] as const
  let i = 0
  for (const [order, { people, ...data }] of shifts.entries()) {
    const shift = await prisma.shift.create({ data: { eventId: event.id, label: data.roleName, displayOrder: order < 2 ? 0 : 1, ...data } })
    for (const [v, present] of people) {
      i++
      await prisma.registration.create({
        data: {
          eventId: event.id, shiftId: shift.id, volunteerId: v.id, status: "active", source: "public_form",
          phone: `079 666 ${String(10 + i).padStart(2, "0")} ${String(30 + i).padStart(2, "0")}`,
          checkedInAt: present ? new Date(Date.now() - (60 - i) * 60_000) : null,
          ...registrationToken.data(`demo-day-of-${shift.id}-${v.id}`),
        },
      })
    }
  }
  console.log(`✓ « ${event.title} » today (${local(new Date()).date}) in ${org.name}: ${shifts.length} shifts around ${local(new Date()).hour} h`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
