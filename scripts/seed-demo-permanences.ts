// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Demo of recurring permanences (#866): a self-managed grocery, « Épicerie de la Gare », with a
 * season built from the « Épicerie participative » template (caisse et accueil, mise en rayon,
 * réception des livraisons) and a few volunteers on the first dates.
 *
 * Its own organization: the village fête of scripts/seed-demo.ts (screenshots and videos) is left
 * untouched. Run on a throwaway database, after `prisma migrate deploy` and `prisma db seed`:
 *   DATABASE_URL=… npx tsx scripts/seed-demo-permanences.ts
 *
 * Idempotent: the organization is deleted and recreated. Dates are relative to today (the season
 * starts on the coming Monday). Every name is invented; emails use example.org.
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../src/lib/token-vault"
import { findTemplate, templateToEvent } from "../src/lib/event-templates"
import { addDays } from "../src/lib/shift-series"

export const DEMO_PERMANENCES_ORG_SLUG = "epicerie-de-la-gare"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const today = new Date().toISOString().slice(0, 10)
const toMonday = (8 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7 || 7
const SEASON_START = addDays(today, toMonday)

const PEOPLE: [string, string][] = [
  ["Aline", "Dupraz"], ["Bastien", "Meylan"], ["Céline", "Ruchet"], ["David", "Pasche"],
  ["Elsa", "Grandjean"], ["Fabien", "Matthey"], ["Gaëlle", "Rosset"], ["Henri", "Python"],
]

const email = (first: string, last: string) =>
  `${first}.${last}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() + "@example.org"

async function main() {
  await prisma.organization.deleteMany({ where: { slug: DEMO_PERMANENCES_ORG_SLUG } })
  const org = await prisma.organization.create({
    data: { name: "Épicerie de la Gare", slug: DEMO_PERMANENCES_ORG_SLUG, publicTitle: "Bénévoles de l'Épicerie de la Gare", timeZone: "Europe/Zurich" },
  })

  const template = findTemplate("epicerie")!
  const draft = templateToEvent(template, { title: "Saison d'automne", startDate: SEASON_START }, "CH")
  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      slug: "saison-automne",
      title: draft.title,
      description: "L'épicerie est tenue par ses membres : chacun donne quelques heures par mois à la caisse, en rayon ou à la réception des livraisons.",
      location: "Rue de la Gare 12",
      publicStatus: "published",
      registrationsOpen: true,
      startDate: new Date(draft.startDate),
      endDate: new Date(draft.endDate),
    },
  })
  for (const { rule, shifts } of draft.recurrences) {
    const created = await prisma.shiftRecurrence.create({
      data: { ...rule, eventId: event.id, fromDate: new Date(rule.fromDate), untilDate: new Date(rule.untilDate) },
    })
    await prisma.shift.createMany({ data: shifts.map((s) => ({ ...s, eventId: event.id, date: new Date(s.date), status: "open", recurrenceId: created.id })) })
  }

  const people = await Promise.all(
    PEOPLE.map(([firstName, lastName]) => prisma.volunteer.create({ data: { organizationId: org.id, firstName, lastName, email: email(firstName, lastName) } })),
  )
  // The first two weeks partly filled, so the season reads as lived in: two people per cash-desk
  // evening, one at the shelves.
  const firstShifts = await prisma.shift.findMany({
    where: { eventId: event.id, date: { lt: new Date(addDays(SEASON_START, 14)) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })
  let n = 0
  for (const shift of firstShifts) {
    const take = shift.roleName === "Caisse et accueil" ? 2 : 1
    for (let i = 0; i < take; i++) {
      const v = people[n++ % people.length]
      await prisma.registration.create({
        data: { eventId: event.id, shiftId: shift.id, volunteerId: v.id, status: "active", source: "public_form", ...registrationToken.data(`demo-perm-${shift.id}-${v.id}`) },
      })
    }
  }

  const shiftCount = await prisma.shift.count({ where: { eventId: event.id } })
  console.log(`Épicerie de la Gare : saison du ${draft.startDate} au ${draft.endDate}, ${draft.recurrences.length} permanences, ${shiftCount} créneaux.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
