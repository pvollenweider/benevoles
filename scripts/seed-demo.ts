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
export const DEMO_TOKENS = {
  volunteer: "demo-volunteer-camille-0001",
  waitlist: "demo-waitlist-camille-0001",
  waitlistRelease: "demo-waitlist-release-zoe-0001",
  approval: "demo-approval-lucas-0001",
  inviteCamille: "demo-invite-camille-0001",
  inviteSecurity: "demo-invite-julien-security-0001",
  inviteNoSecurity: "demo-invite-emma-no-security-0001",
  leader: "demo-leader-buvette-0001",
} as const

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
  // Retries of recorder scenarios share one local browser IP. Production rate limits are correct,
  // but stale counters must not leak from one disposable take into the next one.
  await prisma.rateLimit.deleteMany()

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
  // A small, realistic administration team for the permissions masterclass. Reuse the local
  // demo password hash so the recorder can switch roles without introducing another secret.
  await prisma.adminUser.deleteMany({ where: { email: { in: ["colette.owner@example.org", "sam.organizer@example.org", "lea.pending@example.org"] } } })
  const demoAdmin = await prisma.adminUser.findFirstOrThrow({
    where: { organizationId: org.id, email: process.env.ORG_ADMIN_EMAIL ?? "org-admin@localhost" },
    select: { passwordHash: true },
  })
  await prisma.adminUser.createMany({
    data: [
      { organizationId: org.id, name: "Colette Favre", email: "colette.owner@example.org", passwordHash: demoAdmin.passwordHash, role: "admin", isActive: true },
      { organizationId: org.id, name: "Samira Diallo", email: "sam.organizer@example.org", passwordHash: demoAdmin.passwordHash, role: "organizer", isActive: true },
    ],
  })

  // Clean slate: every recording may create copies, series and disposable events. Keeping any of
  // them makes the next take depend on production order (and the recorder can open an old copy
  // instead of the canonical fête). This seed is only used on the disposable video database, so
  // clear the organization's events completely; cascades remove their scenario-owned data.
  await prisma.event.deleteMany({ where: { organizationId: org.id } })
  await prisma.volunteer.deleteMany({ where: { organizationId: org.id, email: { endsWith: "@example.org" } } })
  await prisma.messageTemplate.deleteMany({ where: { organizationId: org.id } })

  const event = await prisma.event.create({
    data: {
      organizationId: org.id,
      slug: DEMO_EVENT_SLUG,
      title: "Fête du village de Montvert",
      description: "Deux jours de fête sur la place du village : marché, buvette, concerts et bal du samedi soir.",
      location: "Place du Collège, Montvert",
      latitude: 46.1805734,
      longitude: 6.1228285,
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
  await register(buvette2, camille, {
    status: "waiting",
    waitingPosition: 1,
    ...registrationToken.data(DEMO_TOKENS.waitlist),
  })
  await register(buvetteDim, camille)
  await register(demontage, camille)

  for (const v of [lea, emma, manon]) await register(accueil2, v)
  for (const v of [sarah]) await register(accueil3, v)
  for (const v of [noah, chloe, theo, gabriel]) await register(buvette1, v)
  await register(buvette2, zoe, { ...registrationToken.data(DEMO_TOKENS.waitlistRelease) })
  for (const v of [adam, lina, raphael]) await register(buvette2, v)
  await register(buvette2, anna, { status: "waiting", waitingPosition: 2 })
  await register(buvette2, eva, { status: "waiting", waitingPosition: 3 })
  for (const v of [alice, tom]) await register(buvette3, v)
  for (const v of [julien, hugo]) await register(securite, v)
  for (const v of [nathan, eva, raphael, alice]) await register(montage, v)
  for (const v of [manon, ines]) await register(buvetteDim, v)
  for (const v of [theo, gabriel, emma]) await register(demontage, v)
  // « Sur validation » (#484): two requests waiting for a decision, one accepted.
  await register(navette1, lucas, {
    status: "requested",
    ...registrationToken.data(DEMO_TOKENS.approval),
  })
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

  const [tshirt, , drivingLicense] = await Promise.all([
    prisma.eventQuestion.create({ data: { eventId: event.id, position: 0, label: "Taille de t-shirt", type: "single", options: ["S", "M", "L", "XL"], required: true } }),
    prisma.eventQuestion.create({ data: { eventId: event.id, position: 1, label: "Régime alimentaire (repas des bénévoles)", type: "text" } }),
    prisma.eventQuestion.create({ data: { eventId: event.id, position: 2, label: "Permis de conduire", type: "text" } }),
  ])
  for (const [v, size] of [[camille, "M"], [lea, "S"], [noah, "L"], [lucas, "L"], [marc, "XL"]] as const) {
    await prisma.questionAnswer.create({ data: { questionId: tshirt.id, eventId: event.id, volunteerId: v.id, values: [size] } })
  }
  await prisma.questionAnswer.create({ data: { questionId: drivingLicense.id, eventId: event.id, volunteerId: lucas.id, values: ["Permis B depuis 2021"] } })

  // Invitations: some used, some not yet answered.
  for (const [i, v] of [camille, julien, lea, emma, manon, raphael, anna, tom, eva].entries()) {
    const token = v.id === camille.id
      ? DEMO_TOKENS.inviteCamille
      : v.id === julien.id
        ? DEMO_TOKENS.inviteSecurity
        : v.id === emma.id
          ? DEMO_TOKENS.inviteNoSecurity
          : `demo-invite-${v.id}`
    await prisma.memberInvite.create({
      data: { eventId: event.id, volunteerId: v.id, ...linkToken.data(token), sentAt: at(-8, 10), usedAt: i < 6 ? at(-6, 19.5) : null },
    })
  }

  await prisma.messageTemplate.createMany({
    data: [
      { organizationId: org.id, name: "Point de rendez-vous", subject: "Rendez-vous pour ton créneau", body: "Bonjour {prénom},\n\nRendez-vous au stand d'accueil 15 minutes avant ton créneau.\n\nMerci et à bientôt !" },
      { organizationId: org.id, name: "Météo", subject: "Prévoir un vêtement de pluie", body: "Bonjour {prénom},\n\nLa météo annonce de la pluie : prévois un vêtement chaud et imperméable.\n\nMerci !" },
    ],
  })
  await prisma.targetedMessage.create({
    data: {
      organizationId: org.id, eventId: event.id, authorName: "Élodie Rochat",
      subject: "Rendez-vous pour ton créneau", message: "Bonjour,\n\nRendez-vous au stand d'accueil 15 minutes avant ton créneau.",
      audienceLabel: "Tous les inscrits", recipientCount: 22, sentCount: 22, createdAt: day(-2),
    },
  })

  // A realistic event history for the admin demo video. The application normally writes these
  // entries as actions happen; direct fixture creation deliberately bypasses those write paths,
  // so seed the journal explicitly instead of presenting an empty feature screen.
  const admin = await prisma.adminUser.findFirstOrThrow({ where: { organizationId: org.id }, select: { id: true } })
  const camilleAccueil = await prisma.registration.findFirstOrThrow({
    where: { eventId: event.id, volunteerId: camille.id, shiftId: accueil1.id },
    select: { id: true },
  })
  const inesAccueil = await prisma.registration.findFirstOrThrow({
    where: { eventId: event.id, volunteerId: ines.id, shiftId: accueil1.id },
    select: { id: true },
  })
  const camilleInvite = await prisma.memberInvite.findFirstOrThrow({
    where: { eventId: event.id, volunteerId: camille.id },
    select: { id: true },
  })
  await prisma.eventLog.createMany({
    data: [
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "event.published", entityType: "Event", entityId: event.id, changes: { publicStatus: { from: "draft", to: "published" } }, createdAt: at(-12, 9) },
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "shift.created", entityType: "Shift", entityId: buvette1.id, changes: { roleName: { from: null, to: "Buvette" }, capacity: { from: null, to: 4 } }, createdAt: at(-11, 10) },
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "shift.updated", entityType: "Shift", entityId: buvette1.id, changes: { capacity: { from: 3, to: 4 }, waitlistEnabled: { from: false, to: true } }, createdAt: at(-10, 14) },
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "memberinvite.sent", entityType: "MemberInvite", entityId: camilleInvite.id, createdAt: at(-8, 10) },
      { eventId: event.id, actorType: "volunteer", actorId: camille.id, action: "registration.created", entityType: "Registration", entityId: camilleAccueil.id, changes: { shiftId: { from: null, to: accueil1.id }, source: { from: null, to: "public_form" } }, createdAt: at(-5, 18) },
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "registration.created", entityType: "Registration", entityId: inesAccueil.id, changes: { shiftId: { from: null, to: accueil1.id }, source: { from: null, to: "admin_manual" } }, createdAt: at(-4, 11) },
      { eventId: event.id, actorType: "volunteer", actorId: julien.id, action: "registration.cancelled", entityType: "Registration", entityId: "demo-cancelled-registration", changes: { shiftId: { from: securite.id, to: securite.id }, status: { from: "active", to: "cancelled" } }, createdAt: at(-3, 16) },
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "registration.checked_in", entityType: "Registration", entityId: camilleAccueil.id, changes: { shiftId: { from: accueil1.id, to: accueil1.id }, status: { from: "active", to: "present" } }, createdAt: at(-1, 9) },
      { eventId: event.id, actorType: "admin", actorId: admin.id, action: "event.updated", entityType: "Event", entityId: event.id, changes: { publicInstructions: { from: null, to: "Point de rendez-vous ajouté" } }, createdAt: at(-1, 15) },
    ],
  })

  console.log(`✓ Demo event « ${event.title} » (/${DEMO_EVENT_SLUG}?org=${org.slug}): ${shifts.length} shifts, ${people.length} volunteers`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
