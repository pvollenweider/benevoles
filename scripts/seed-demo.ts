// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Demo data for the documentation screenshots (#497): one fictional village fête in the
 * default organization, rich enough to show every screen the guides describe (waitlist, a
 * « Sur validation » shift with requests, a reserved role, a night shift, custom questions,
 * sector leaders, milestones, pages, message templates and history).
 *
 * Run on a throwaway database, after `prisma migrate deploy` and `prisma db seed`:
 *   DATABASE_URL=… npx tsx scripts/seed-demo.ts
 *
 * Idempotent: the demo event and its volunteers are deleted and recreated. Dates are relative
 * to today (the fête is on the next weekend at least 3 days away), so the dashboard has
 * something to say. Every name,
 * address and phone number is invented; emails use example.org. The personal-link tokens are
 * fixed (DEMO_TOKENS) so scripts/screenshots.mjs can open the volunteer's and the leader's
 * pages; never use them outside a demo database.
 */

import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { linkToken, registrationToken } from "../src/lib/token-vault"

export const DEMO_EVENT_SLUG = "fete-du-village"
export const DEMO_TOKENS = { volunteer: "demo-volunteer-camille-0001", leader: "demo-leader-buvette-0001" } as const

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

const DAY = 86_400_000
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
const day = (offset: number) => new Date(today.getTime() + offset * DAY)
const iso = (d: Date) => d.toISOString().slice(0, 10)
/** A day relative to today at a daytime hour (UTC), so timestamps read naturally. */
const at = (offset: number, hour: number) => new Date(day(offset).getTime() + hour * 3600_000)
// The next Saturday at least 3 days away, then Sunday.
const toSaturday = (6 - today.getUTCDay() + 7) % 7
const SAT = day(toSaturday < 3 ? toSaturday + 7 : toSaturday)
const SUN = new Date(SAT.getTime() + DAY)

const PEOPLE: [string, string, string[], string[]?][] = [
  ["Camille", "Rochat", ["habitué"], ["matin", "après-midi"]],
  ["Julien", "Favre", ["sécurité"], ["soir"]],
  ["Léa", "Morand", [], ["après-midi"]],
  ["Noah", "Dubois", ["jeune"]],
  ["Emma", "Perrin", ["habitué"], ["matin"]],
  ["Lucas", "Girard", ["permis B"]],
  ["Chloé", "Bonvin", []],
  ["Hugo", "Mercier", ["sécurité"]],
  ["Manon", "Aebi", ["habitué"]],
  ["Louis", "Chappuis", ["permis B"]],
  ["Sarah", "Jaquet", []],
  ["Nathan", "Rey", ["jeune"]],
  ["Inès", "Cuennet", [], ["soir"]],
  ["Théo", "Berset", []],
  ["Alice", "Genoud", ["habitué"]],
  ["Gabriel", "Monnier", []],
  ["Zoé", "Pittet", []],
  ["Adam", "Sauthier", []],
  ["Lina", "Vuilleumier", ["jeune"]],
  ["Raphaël", "Delacrétaz", ["habitué"]],
  ["Anna", "Bühler", []],
  ["Tom", "Rossier", []],
  ["Eva", "Clerc", []],
  ["Marc", "Duc", ["permis B"]],
]

const email = (first: string, last: string) =>
  `${first}.${last}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() + "@example.org"

async function main() {
  const org = await prisma.organization.update({
    where: { id: "default" },
    data: {
      name: "Fêtes de Montvert",
      publicTitle: "Bénévoles des Fêtes de Montvert",
      timeZone: "Europe/Zurich",
      volunteerCharter: "Je m'engage à venir à l'heure à mes créneaux, à prévenir si j'ai un empêchement et à suivre les consignes des responsables.",
    },
  })

  // The organizer signed in on the admin screenshots.
  await prisma.adminUser.updateMany({ where: { organizationId: org.id, email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" }, data: { name: "Élodie Rochat" } })

  // Clean slate: the demo event (cascades to its shifts, registrations, pages…) and the demo people.
  // The base seed's past event goes too: the screenshots show one current fête.
  await prisma.event.deleteMany({ where: { organizationId: org.id, slug: { in: [DEMO_EVENT_SLUG, "spectacle-cirque-2026"] } } })
  await prisma.volunteer.deleteMany({ where: { organizationId: org.id, email: { endsWith: "@example.org" } } })
  await prisma.messageTemplate.deleteMany({ where: { organizationId: org.id } })

  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      slug: DEMO_EVENT_SLUG,
      title: "Fête du village de Montvert",
      description: "Deux jours de fête sur la place du village : marché, buvette, concerts et bal du samedi soir.",
      location: "Place du Collège, Montvert",
      publicStatus: "published",
      startDate: SAT,
      endDate: SUN,
      requirePhone: true,
      accentColorKey: "emerald",
      publicInstructions: "Merci de votre aide ! Présentez-vous au stand d'accueil 15 minutes avant votre créneau : on vous remettra votre t-shirt.",
      confirmationMessage: "Merci {prenom} ! Rendez-vous au stand d'accueil 15 minutes avant ton créneau.",
      showSchedule: [
        { name: "Concert de la fanfare", date: iso(SAT), startTime: "17:00", endTime: "18:30" },
        { name: "Bal populaire", date: iso(SAT), startTime: "21:00", endTime: "01:00" },
        { name: "Brunch", date: iso(SUN), startTime: "10:00", endTime: "13:00" },
      ],
    },
  })

  type ShiftSeed = { roleName: string; date: Date; startTime: string; endTime: string; capacity: number; colorKey: string } & Partial<{
    label: string; waitlistEnabled: boolean; requiresApproval: boolean; minAge: number; reservedTags: string[]; maxPerVolunteer: number
    locationDetails: string; instructions: string; contactName: string; contactPhone: string; displayOrder: number
  }>
  const seeds: ShiftSeed[] = [
    { roleName: "Montage", date: SAT, startTime: "07:00", endTime: "09:00", capacity: 6, colorKey: "slate", locationDetails: "Hangar communal", instructions: "Chaussures fermées" },
    { roleName: "Accueil", date: SAT, startTime: "09:00", endTime: "12:00", capacity: 3, colorKey: "sky", locationDetails: "Stand d'accueil, entrée de la place" },
    { roleName: "Accueil", date: SAT, startTime: "12:00", endTime: "15:00", capacity: 3, colorKey: "sky", locationDetails: "Stand d'accueil, entrée de la place" },
    { roleName: "Accueil", date: SAT, startTime: "15:00", endTime: "18:00", capacity: 3, colorKey: "sky", locationDetails: "Stand d'accueil, entrée de la place" },
    { roleName: "Buvette", date: SAT, startTime: "10:00", endTime: "14:00", capacity: 4, colorKey: "amber", waitlistEnabled: true, maxPerVolunteer: 2, contactName: "Élodie", contactPhone: "079 000 00 00" },
    { roleName: "Buvette", date: SAT, startTime: "14:00", endTime: "18:00", capacity: 4, colorKey: "amber", waitlistEnabled: true, maxPerVolunteer: 2 },
    { roleName: "Buvette", date: SAT, startTime: "18:00", endTime: "22:00", capacity: 4, colorKey: "amber", waitlistEnabled: true, maxPerVolunteer: 2, minAge: 18 },
    { roleName: "Navette", label: "Chauffeur navette", date: SAT, startTime: "08:00", endTime: "12:00", capacity: 2, colorKey: "violet", requiresApproval: true, minAge: 21, instructions: "Permis B depuis 3 ans" },
    { roleName: "Navette", label: "Chauffeur navette", date: SAT, startTime: "14:00", endTime: "18:00", capacity: 2, colorKey: "violet", requiresApproval: true, minAge: 21, instructions: "Permis B depuis 3 ans" },
    { roleName: "Sécurité", date: SAT, startTime: "20:00", endTime: "02:00", capacity: 3, colorKey: "rose", reservedTags: ["sécurité"] },
    { roleName: "Buvette", date: SUN, startTime: "10:00", endTime: "14:00", capacity: 4, colorKey: "amber", waitlistEnabled: true, maxPerVolunteer: 2 },
    { roleName: "Démontage", date: SUN, startTime: "15:00", endTime: "18:00", capacity: 6, colorKey: "slate" },
  ]
  const roleOrder = ["Montage", "Accueil", "Buvette", "Navette", "Sécurité", "Démontage"]
  const shifts = []
  for (const s of seeds) {
    shifts.push(await prisma.shift.create({
      data: { eventId: event.id, label: s.label ?? s.roleName, displayOrder: roleOrder.indexOf(s.roleName), ...s },
    }))
  }
  const [montage, accueil1, accueil2, accueil3, buvette1, buvette2, buvette3, navette1, navette2, securite, buvetteDim, demontage] = shifts

  const people = []
  for (const [i, [firstName, lastName, tags, periods]] of PEOPLE.entries()) {
    people.push(await prisma.volunteer.create({
      data: {
        organizationId: org.id, firstName, lastName, email: email(firstName, lastName),
        phone: `079 555 ${String(10 + i).padStart(2, "0")} ${String(20 + i).padStart(2, "0")}`,
        tags, availabilityPeriods: periods ?? [],
        ...(i === 0 ? { availabilityNote: "Pas le dimanche matin" } : {}),
      },
    }))
  }
  const [camille, julien, lea, noah, emma, lucas, chloe, hugo, manon, louis, sarah, nathan, ines, theo, alice, gabriel, zoe, adam, lina, raphael, anna, tom, eva, marc] = people

  let n = 0
  const register = (shift: { id: string }, v: { id: string }, extra: Record<string, unknown> = {}) =>
    prisma.registration.create({
      data: {
        eventId: event.id, shiftId: shift.id, volunteerId: v.id, status: "active", source: "public_form",
        ...registrationToken.data(v.id === camille.id && n++ === 0 ? DEMO_TOKENS.volunteer : `demo-${shift.id}-${v.id}`),
        createdAt: at(-5, 18 + (n % 4)),
        linkEmailedAt: at(-5, 18 + (n % 4)),
        ...extra,
      },
    })

  // Camille: the personal page of the guide (confirmed shifts, one on the waitlist).
  await register(accueil1, camille)
  await register(buvette2, camille, { status: "waiting", waitingPosition: 1 })
  await register(demontage, camille)

  for (const v of [lea, emma, manon]) await register(accueil2, v)
  for (const v of [sarah]) await register(accueil3, v)
  for (const v of [noah, chloe, theo, gabriel]) await register(buvette1, v)
  for (const v of [zoe, adam, lina, raphael]) await register(buvette2, v)
  await register(buvette2, anna, { status: "waiting", waitingPosition: 2 })
  for (const v of [alice, tom]) await register(buvette3, v)
  for (const v of [julien, hugo]) await register(securite, v)
  for (const v of [nathan, eva, raphael, alice]) await register(montage, v)
  for (const v of [manon, ines]) await register(buvetteDim, v)
  for (const v of [theo, gabriel, emma]) await register(demontage, v)
  // « Sur validation » (#484): two requests waiting for a decision, one accepted.
  await register(navette1, lucas, { status: "requested" })
  await register(navette1, marc, { status: "requested" })
  await register(navette2, louis)
  // Manual add, with a note.
  await register(accueil1, ines, { source: "admin_manual", comment: "Inscrite par téléphone" })

  await prisma.sectorLeader.create({
    data: { eventId: event.id, roleName: "Buvette", name: "Élodie Rochat", email: "elodie.rochat@example.org", ...linkToken.data(DEMO_TOKENS.leader) },
  })
  await prisma.sectorLeader.create({
    data: { eventId: event.id, roleName: "Accueil", name: "Manon Aebi", email: email("Manon", "Aebi"), ...linkToken.data("demo-leader-accueil-0001") },
  })

  await prisma.eventMilestone.createMany({
    data: [
      { eventId: event.id, title: "Commander les t-shirts", dueDate: day(-10), done: true },
      { eventId: event.id, title: "Confirmer la location de la tente", dueDate: day(-1), done: false },
      { eventId: event.id, title: "Envoyer le planning aux responsables", dueDate: day(3), done: false },
    ],
  })

  await prisma.eventPage.createMany({
    data: [
      { eventId: event.id, slug: "acces", title: "Accès et parking", displayOrder: 0, content: "## En transports publics\n\nBus 12, arrêt « Montvert, Collège ».\n\n## En voiture\n\nParking du terrain de foot, à 5 minutes à pied. La navette circule le samedi matin et l'après-midi." },
      { eventId: event.id, slug: "faq", title: "Questions fréquentes", displayOrder: 1, content: "**Suis-je assuré·e ?** Oui, par l'assurance de l'association.\n\n**Faut-il une tenue ?** Un t-shirt de la fête vous est remis à l'accueil." },
    ],
  })

  const [tshirt] = await Promise.all([
    prisma.eventQuestion.create({ data: { eventId: event.id, position: 0, label: "Taille de t-shirt", type: "single", options: ["S", "M", "L", "XL"], required: true } }),
    prisma.eventQuestion.create({ data: { eventId: event.id, position: 1, label: "Régime alimentaire (repas des bénévoles)", type: "text" } }),
  ])
  for (const [v, size] of [[camille, "M"], [lea, "S"], [noah, "L"], [lucas, "L"], [marc, "XL"]] as const) {
    await prisma.questionAnswer.create({ data: { questionId: tshirt.id, eventId: event.id, volunteerId: v.id, values: [size] } })
  }

  // Invitations: some used, some not yet answered.
  for (const [i, v] of [camille, lea, emma, manon, raphael, anna, tom, eva].entries()) {
    await prisma.memberInvite.create({
      data: { eventId: event.id, volunteerId: v.id, ...linkToken.data(`demo-invite-${v.id}`), sentAt: at(-8, 10), usedAt: i < 5 ? at(-6, 19.5) : null },
    })
  }

  await prisma.messageTemplate.createMany({
    data: [
      { organizationId: org.id, name: "Point de rendez-vous", subject: "Rendez-vous pour ton créneau", body: "Bonjour {prenom},\n\nRendez-vous au stand d'accueil 15 minutes avant ton créneau.\n\nMerci et à bientôt !" },
      { organizationId: org.id, name: "Météo", subject: "Prévoir un vêtement de pluie", body: "Bonjour {prenom},\n\nLa météo annonce de la pluie : prévois un vêtement chaud et imperméable.\n\nMerci !" },
    ],
  })
  await prisma.targetedMessage.create({
    data: {
      organizationId: org.id, eventId: event.id, authorName: "Élodie Rochat",
      subject: "Rendez-vous pour ton créneau", message: "Bonjour,\n\nRendez-vous au stand d'accueil 15 minutes avant ton créneau.",
      audienceLabel: "Tous les inscrits", recipientCount: 22, sentCount: 22, createdAt: day(-2),
    },
  })

  console.log(`✓ Demo event « ${event.title} » (/${DEMO_EVENT_SLUG}?org=${org.slug}): ${shifts.length} shifts, ${people.length} volunteers`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
