// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Demo of « Qui est inscrit » (#1068) for the documentation screenshots: an organization of its
 * own, « Amicale du Marché », with
 * - « Marché de Noël », published, the setting on: confirmed volunteers, some of whom chose to
 *   show their name, and Léa, registered before the setting was turned on, whose name stays
 *   hidden (her personal page shows the card with its switch off, « Masqué »);
 * - « Marché de printemps », a draft with the setting on (the default of a new event), for the
 *   publication page's note.
 *
 * Its own organization: the village fête of scripts/seed-demo.ts and every other capture are left
 * untouched. Run on a throwaway database, after `prisma migrate deploy`, `prisma db seed` and
 * scripts/seed-demo.ts (its admin's password hash is reused):
 *   DATABASE_URL=… npx tsx scripts/seed-demo-roster.ts
 *
 * Idempotent: the organization is deleted and recreated. Dates are relative to today. Every name
 * is invented; emails use example.org. The personal-link token is fixed (DEMO_ROSTER_TOKEN) so
 * scripts/screenshots.mjs can open Léa's page; never use it outside a demo database.
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { registrationToken } from "../src/lib/token-vault"
import { ROSTER_NOTICE_VERSION } from "../src/lib/shift-roster"

export const DEMO_ROSTER_ORG_SLUG = "amicale-du-marche"
/** Its organizer, signed in on the screenshots of this organization (same password as ORG_ADMIN_EMAIL). */
export const DEMO_ROSTER_ADMIN_EMAIL = "marche.admin@example.org"
export const DEMO_ROSTER_EVENT_SLUG = "marche-de-noel"
export const DEMO_ROSTER_TOKEN = "demo-roster-lea-0001"

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const DAY = 86_400_000
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
const day = (offset: number) => new Date(today.getTime() + offset * DAY)

/** [first name, last name, chose to show their name] */
const PEOPLE: [string, string, boolean][] = [
  ["Léa", "Fontannaz", false],
  ["Aline", "Monnier", true],
  ["Bastien", "Rey", true],
  ["Chloé", "Délèze", true],
  ["Damien", "Crettenand", false],
  ["Élodie", "Bornet", true],
  ["Florian", "Gaillard", false],
  ["Gaëlle", "Rouiller", false],
]

const email = (first: string, last: string) =>
  `${first}.${last}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() + "@example.org"

async function main() {
  await prisma.organization.deleteMany({ where: { slug: DEMO_ROSTER_ORG_SLUG } })
  const org = await prisma.organization.create({
    data: { name: "Amicale du Marché", slug: DEMO_ROSTER_ORG_SLUG, publicTitle: "Bénévoles de l'Amicale du Marché", timeZone: "Europe/Zurich" },
  })
  // Reuse the demo admin's password hash (like scripts/seed-demo-permanences.ts): no other secret.
  const demoAdmin = await prisma.adminUser.findFirstOrThrow({
    where: { organizationId: "default", email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" },
    select: { passwordHash: true },
  })
  await prisma.adminUser.deleteMany({ where: { email: DEMO_ROSTER_ADMIN_EMAIL } })
  await prisma.adminUser.create({
    data: { organizationId: org.id, name: "Aline Monnier", email: DEMO_ROSTER_ADMIN_EMAIL, passwordHash: demoAdmin.passwordHash, role: "admin", isActive: true },
  })

  const start = day(20)
  const end = day(21)
  const event = await prisma.event.create({
    data: {
      organizationId: org.id, slug: DEMO_ROSTER_EVENT_SLUG, title: "Marché de Noël", location: "Place du Midi",
      description: "Deux jours de marché sur la place : accueil des exposants, stand de vin chaud et rangement.",
      publicStatus: "published", registrationsOpen: true, startDate: start, endDate: end, shiftRosterEnabled: true,
    },
  })
  const shiftData = [
    { roleName: "Montage des stands", date: start, startTime: "06:00", endTime: "08:00", capacity: 4 },
    { roleName: "Accueil des exposants", date: start, startTime: "08:00", endTime: "11:00", capacity: 4 },
    { roleName: "Vin chaud", date: start, startTime: "16:00", endTime: "20:00", capacity: 4 },
    { roleName: "Vin chaud", date: end, startTime: "16:00", endTime: "20:00", capacity: 4 },
    { roleName: "Rangement", date: end, startTime: "20:00", endTime: "22:00", capacity: 6 },
  ]
  const shifts = []
  for (const [order, s] of shiftData.entries()) {
    shifts.push(await prisma.shift.create({ data: { eventId: event.id, label: s.roleName, displayOrder: order, ...s } }))
  }
  const [montage, accueil, vinSam, vinDim, rangement] = shifts

  const people = await Promise.all(
    PEOPLE.map(([firstName, lastName]) => prisma.volunteer.create({ data: { organizationId: org.id, firstName, lastName, email: email(firstName, lastName) } })),
  )
  const [lea, aline, bastien, chloe, damien, elodie, florian, gaelle] = people
  const places: [typeof lea, typeof accueil][] = [
    [lea, vinSam], [lea, rangement],
    [aline, vinSam], [aline, accueil],
    [bastien, vinSam], [bastien, rangement],
    [chloe, accueil], [chloe, vinDim],
    [damien, vinSam],
    [elodie, rangement], [elodie, vinDim],
    // Hidden only: the card gives their number, never their names (« et 1 autre bénévole »,
    // « 2 autres bénévoles, sans nom affiché »).
    [florian, montage], [florian, accueil],
    [gaelle, montage],
  ]
  let first = true
  for (const [v, shift] of places) {
    const token = v.id === lea.id && first ? DEMO_ROSTER_TOKEN : `demo-roster-${shift.id}-${v.id}`
    if (v.id === lea.id) first = false
    await prisma.registration.create({
      data: { eventId: event.id, shiftId: shift.id, volunteerId: v.id, status: "active", source: "public_form", ...registrationToken.data(token) },
    })
  }
  // Those who chose to show their name; Léa, Damien, Florian and Gaëlle made no choice: hidden.
  for (const [i, [, , visible]] of PEOPLE.entries()) {
    if (!visible) continue
    await prisma.rosterConsent.create({
      data: { eventId: event.id, volunteerId: people[i].id, status: "visible", noticeVersion: ROSTER_NOTICE_VERSION, source: "personal_page", decidedAt: day(-2) },
    })
  }

  // A draft with the setting on, as a new event starts: the publication page says so.
  const spring = await prisma.event.create({
    data: {
      organizationId: org.id, slug: "marche-de-printemps", title: "Marché de printemps", location: "Place du Midi",
      publicStatus: "draft", startDate: day(120), endDate: day(120), shiftRosterEnabled: true,
    },
  })
  await prisma.shift.create({ data: { eventId: spring.id, roleName: "Accueil des exposants", label: "Accueil des exposants", date: day(120), startTime: "08:00", endTime: "11:00", capacity: 4 } })

  console.log(`✓ « ${event.title} » (roster on) and « ${spring.title} » (draft, roster on) in ${org.name}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
