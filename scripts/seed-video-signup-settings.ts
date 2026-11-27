// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the EVENT_SIGNUP_PAGE_SETTINGS video: the four settings that change what volunteers
 * see on the sign-up page (« Affichage des créneaux par défaut », « Créneaux qui se chevauchent »,
 * the volunteer convention, « Regrouper les créneaux par secteur sur la page d'inscription »). One
 * dedicated synthetic organisation, « Association des Vendanges de Montvert » (`video-signup`, slug
 * `formation-inscription`), with its owner. Never the demo organisation, never another video's one.
 *
 * The event, « Fête des vendanges de Montvert », is published, on a Saturday at least two weeks
 * ahead, with sectors adopted (« Accueil » and « Buvette ») and one poste without a sector
 * (« Rangement », shown under « Autres postes »). « Vestiaire » (Accueil) and « Bar » (Buvette) run
 * at the same hours, so the take can show an overlap refused, then allowed. Every setting starts at
 * its default: view « auto », overlaps not allowed, convention asked, grouping off. Some shifts have
 * a description and a place, so « Détails » appears in the list.
 *
 * Reset guards: an existing `video-signup` organisation is emptied only when every account, member
 * and event in it is one of this fixture's (exact ids and example.org addresses). Anything else
 * stops the seed. Called through scripts/seed-video-scenario.ts, which refuses any database but the
 * video one. Dates are relative to the take, in Europe/Zurich: the video does not rot.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { localToday, saturdayAfter } from "./seed-video-beta"

export const SP_ORG = { id: "video-signup", slug: "formation-inscription", name: "Association des Vendanges de Montvert" } as const
export const SP_OWNER = { id: "video-signup-owner", email: "video.signup.owner@example.org", firstName: "Élodie" } as const
export const SP_EVENT = { id: "video-signup-event", slug: "fete-des-vendanges", title: "Fête des vendanges de Montvert" } as const
/** Every member address of the fixture; the mailbox cleanup uses the same rule. */
export const SP_PERSON_EMAIL = /^video\.signup\.[a-z]+@example\.org$/
const TIME_ZONE = "Europe/Zurich"

const email = (key: string) => `video.signup.${key}@example.org`

/** The people of the fixture: key → cast first name (videos/lib/fixture-names.ts). */
export const SP_PEOPLE = { aline: "Aline", nicolas: "Nicolas", lea: "Léa", noah: "Noah", sarah: "Sarah" } as const

/** Sectors in their order; « Rangement » has none. */
export const SP_SECTORS = ["Accueil", "Buvette"] as const

export type SpShift = { key: string; start: string; end: string; capacity: number; people: (keyof typeof SP_PEOPLE)[] }
export type SpPoste = { roleName: string; sector: (typeof SP_SECTORS)[number] | null; colorKey: string; description: string | null; locationDetails: string | null; shifts: SpShift[] }

/**
 * Postes in their display order, deliberately not grouped by sector, so the take shows the grouping
 * reorder them. « Vestiaire » and « Bar » overlap from 18 h to 21 h.
 */
export const SP_POSTES: SpPoste[] = [
  { roleName: "Accueil entrée", sector: "Accueil", colorKey: "sky", description: "Accueillir les visiteurs, distribuer le programme et orienter vers les pressoirs.", locationDetails: "Grand portail, place du Pressoir", shifts: [
    { key: "accueil-am", start: "09:00", end: "12:00", capacity: 3, people: ["aline"] },
    { key: "accueil-pm", start: "14:00", end: "17:00", capacity: 3, people: [] },
  ] },
  { roleName: "Bar", sector: "Buvette", colorKey: "amber", description: "Servir le moût et les boissons, tenir la caisse à deux.", locationDetails: "Tente de la buvette, à côté de la scène", shifts: [
    { key: "bar-evening", start: "18:00", end: "21:00", capacity: 4, people: ["nicolas"] },
  ] },
  { roleName: "Rangement", sector: null, colorKey: "slate", description: null, locationDetails: null, shifts: [
    { key: "rangement", start: "21:00", end: "23:00", capacity: 4, people: [] },
  ] },
  { roleName: "Cuisine", sector: "Buvette", colorKey: "rose", description: "Préparer les assiettes vigneronnes et le gâteau aux raisins.", locationDetails: "Cuisine de la salle communale", shifts: [
    { key: "cuisine", start: "11:00", end: "14:00", capacity: 3, people: ["lea"] },
  ] },
  { roleName: "Vestiaire", sector: "Accueil", colorKey: "violet", description: null, locationDetails: "Entrée de la salle communale", shifts: [
    { key: "vestiaire", start: "18:00", end: "21:00", capacity: 2, people: ["noah"] },
  ] },
]

/** The shift of a key. */
export const spShiftId = (key: string) => `video-signup-shift-${key}`

type Db = PrismaClient

async function resetOrganization(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: SP_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, SP_ORG.slug, "video-signup organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === SP_OWNER.id && a.email === SP_OWNER.email), "video-signup organisation has an unknown account")
    assert(previous.volunteers.every((v) => SP_PERSON_EMAIL.test(v.email ?? "")), "video-signup organisation has an unknown member")
    assert(previous.events.every((e) => e.id === SP_EVENT.id), "video-signup organisation has an unknown event")
    // Cascades remove sectors, shifts and registrations of the fixture.
    await db.event.deleteMany({ where: { organizationId: SP_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: SP_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: SP_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: SP_ORG.slug } }), 0, "slug formation-inscription already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: SP_OWNER.email } }), 0, "owner address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: SP_ORG.name, timeZone: TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(),
    replyToEmail: SP_OWNER.email,
    // The take turns the convention off in Paramètres: it starts asked, with the default text.
    volunteerConventionEnabled: true,
    volunteerCharter: null,
    betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: false,
  }
  if (previous) await db.organization.update({ where: { id: SP_ORG.id }, data: org })
  else await db.organization.create({ data: { id: SP_ORG.id, slug: SP_ORG.slug, ...org } })
  const owner = { organizationId: SP_ORG.id, email: SP_OWNER.email, name: fullNameOf(SP_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: SP_OWNER.id }, create: { id: SP_OWNER.id, ...owner }, update: owner })

  // Repeated local takes share one browser IP: stale counters of an earlier take must not hold this one.
  await db.rateLimit.deleteMany()
}

/**
 * EVENT_SIGNUP_PAGE_SETTINGS: every sign-up page setting at its default, sectors adopted, two
 * shifts at the same hours on two postes, five confirmed people.
 */
export async function seedVideoSignupPageSettings(db: Db) {
  await resetOrganization(db)
  const day = saturdayAfter(localToday(new Date()), 14)
  const event = await db.event.create({
    data: {
      id: SP_EVENT.id, organizationId: SP_ORG.id, slug: SP_EVENT.slug, title: SP_EVENT.title,
      description: "Une journée au village pour fêter la fin des vendanges : pressoirs ouverts, buvette, repas vigneron et bal du soir. Les bénévoles tiennent l'accueil, la buvette, la cuisine et le rangement.",
      location: "Place du Pressoir, Montvert", publicStatus: "published", registrationsOpen: true, remindersEnabled: false,
      startDate: new Date(day), endDate: new Date(day),
      publicShiftView: "auto", overlapsAllowed: false, publicSectorGrouping: false,
      sectorsEnabled: true, sectorsAdoptedAt: new Date(),
    },
  })
  const sectorIds = new Map<string, string>()
  for (const [index, name] of SP_SECTORS.entries()) {
    const sector = await db.sector.create({ data: { id: `video-signup-sector-${index}`, eventId: event.id, name, displayOrder: index } })
    sectorIds.set(name, sector.id)
  }
  const volunteerIds = new Map<string, string>()
  for (const [key, firstName] of Object.entries(SP_PEOPLE)) {
    const volunteer = await db.volunteer.create({ data: { id: `video-signup-person-${key}`, organizationId: SP_ORG.id, firstName, lastName: surnameOf(firstName), email: email(key) } })
    volunteerIds.set(key, volunteer.id)
  }
  for (const [order, poste] of SP_POSTES.entries()) {
    for (const s of poste.shifts) {
      const shift = await db.shift.create({ data: {
        id: spShiftId(s.key), eventId: event.id, roleName: poste.roleName, label: poste.roleName, date: new Date(day),
        startTime: s.start, endTime: s.end, capacity: s.capacity, displayOrder: order, colorKey: poste.colorKey,
        description: poste.description, locationDetails: poste.locationDetails,
        sectorId: poste.sector ? sectorIds.get(poste.sector)! : null,
      } })
      for (const key of s.people) {
        await db.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: volunteerIds.get(key)!, status: "active", source: "public_form", ...registrationToken.data(`demo-signup-${key}-0001`) } })
      }
    }
  }
  console.log(`✓ Sign-up page settings fixture: « ${SP_EVENT.title} » on ${day} in « ${SP_ORG.name} » (formation-inscription), sectors ${SP_SECTORS.join(" and ")} adopted, every sign-up page setting at its default; owner ${SP_OWNER.email}`)
}
