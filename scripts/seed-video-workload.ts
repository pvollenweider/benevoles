// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the WORKLOAD_PROTECTION video (#1171): « Protection des pauses et de la charge », in
 * beta. One dedicated synthetic organisation, « Association du Lac de Montvert » (`video-workload`,
 * slug `formation-charge`), with its owner. Never the demo organisation, never the beta videos' one.
 *
 * The beta gate is set the way the app reads it (src/lib/beta-capabilities.ts, beta-access.ts): the
 * operator's open list in PlatformSetting `beta.capabilities` holds `workloadProtection` only, and
 * the organisation takes part (`Organization.betaOptInAt`). The open list is platform-wide:
 * scripts/seed-demo.ts removes it again, so the demo videos never show a beta option.
 *
 * The event, « Festival du Lac de Montvert », runs Friday to Sunday at least two weeks ahead, with
 * its protection OFF and no policy: the video fills the card. Three places already exist (Grande
 * Scène, Scène du Lac, Chapiteau); the take adds « Le Dôme », leaves « Vestiaire du Dôme » without a
 * place, and turns « Repas sur le pouce possible » on for « Bar Grande Scène » before the card.
 * The schedule is built so that, with the take's values (videos/lib/__tests__/workload-fixture.test.ts
 * judges it with the real evaluator): only Noah, on the three days, breaks « 1 jour sans mission sur
 * 3 »; nobody breaks the final limits; Emma's two Saturday shifts are refused; Sarah's withdrawal
 * from « Accueil Chapiteau » leaves her Sunday over the longest wait.
 *
 * Reset guards: an existing `video-workload` organisation is emptied only when every account, member
 * and event in it is one of this fixture's (exact ids and example.org addresses). Anything else
 * stops the seed. Called through scripts/seed-video-scenario.ts, which refuses any database but the
 * video one. Dates are relative to the take, in Europe/Zurich: the video does not rot.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { registrationToken } from "../src/lib/token-vault"
import { BETA_SETTING_KEY } from "../src/lib/beta-capabilities"
import { addDays } from "../src/lib/shift-series"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { localToday } from "./seed-video-beta"

export const WL_ORG = { id: "video-workload", slug: "formation-charge", name: "Association du Lac de Montvert" } as const
export const WL_OWNER = { id: "video-workload-owner", email: "video.workload.owner@example.org", firstName: "Samira" } as const
export const WL_EVENT = { id: "video-workload-event", slug: "festival-du-lac", title: "Festival du Lac de Montvert" } as const
/** Every member address of the fixture, Emma's (typed during the take) included; the mailbox cleanup uses the same rule. */
export const WL_PERSON_EMAIL = /^video\.workload\.[a-z]+@example\.org$/
const TIME_ZONE = "Europe/Zurich"

const email = (key: string) => `video.workload.${key}@example.org`
/** The personal-page token of a person's n-th registration (1-based), in creation order: `/my/<token>`. */
export const wlToken = (key: string, n = 1) => `demo-workload-${key}-${String(n).padStart(4, "0")}`

/** The people of the fixture: key → cast first name (videos/lib/fixture-names.ts). Emma signs up during the take. */
export const WL_PEOPLE = { aline: "Aline", nicolas: "Nicolas", lea: "Léa", noah: "Noah", sarah: "Sarah", lucas: "Lucas", camille: "Camille", zoe: "Zoé" } as const
export const WL_NEWCOMER = { key: "emma", firstName: "Emma" } as const

/** Places that exist before the take, in their order; the take adds « Le Dôme ». */
export const WL_PLACES = ["Grande Scène", "Scène du Lac", "Chapiteau"] as const

export type WlShift = { key: string; day: number; start: string; end: string; capacity: number; people: (keyof typeof WL_PEOPLE)[] }
export type WlPoste = { roleName: string; colorKey: string; locationDetails: string; place: (typeof WL_PLACES)[number] | null; shifts: WlShift[] }

/**
 * Postes and shifts; `day` counts from the Friday. Order matters: each person's first registration
 * gives their `/my` token, so Sarah's page is opened through her Sunday morning shift, which she
 * keeps (she withdraws from « Accueil Chapiteau »).
 */
export const WL_POSTES: WlPoste[] = [
  { roleName: "Accueil Scène du Lac", colorKey: "sky", locationDetails: "Entrée de la Scène du Lac", place: "Scène du Lac", shifts: [
    { key: "lac-fri-am", day: 0, start: "09:00", end: "12:00", capacity: 3, people: ["noah"] },
    { key: "lac-sat-am", day: 1, start: "09:00", end: "12:00", capacity: 3, people: ["noah"] },
    { key: "lac-sat-pm", day: 1, start: "14:30", end: "17:30", capacity: 3, people: ["lea"] },
    { key: "lac-sun-am", day: 2, start: "09:00", end: "12:00", capacity: 3, people: ["sarah", "noah"] },
  ] },
  { roleName: "Accueil Chapiteau", colorKey: "violet", locationDetails: "Entrée du Chapiteau", place: "Chapiteau", shifts: [
    { key: "chap-sat", day: 1, start: "14:30", end: "18:00", capacity: 3, people: ["camille"] },
    { key: "chap-sun", day: 2, start: "14:30", end: "16:00", capacity: 3, people: ["sarah"] },
  ] },
  { roleName: "Bar Grande Scène", colorKey: "amber", locationDetails: "Bar à gauche de la Grande Scène", place: "Grande Scène", shifts: [
    { key: "bar-fri", day: 0, start: "18:00", end: "22:00", capacity: 6, people: ["aline"] },
    { key: "bar-sat", day: 1, start: "18:00", end: "22:00", capacity: 6, people: ["nicolas"] },
    { key: "bar-sun", day: 2, start: "18:00", end: "21:00", capacity: 6, people: ["sarah", "lucas"] },
  ] },
  { roleName: "Vestiaire du Dôme", colorKey: "slate", locationDetails: "Entrée du Dôme", place: null, shifts: [
    { key: "dome-sat", day: 1, start: "19:00", end: "23:00", capacity: 2, people: ["zoe"] },
  ] },
]

/** The shift of a key. */
export const wlShiftId = (key: string) => `video-workload-shift-${key}`

/** The first Friday at least `minDays` after today. */
export function fridayAfter(today: string, minDays: number): string {
  const from = addDays(today, minDays)
  const weekday = new Date(`${from}T00:00:00Z`).getUTCDay()
  return addDays(from, (5 - weekday + 7) % 7)
}

type Db = PrismaClient

async function resetOrganization(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: WL_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, WL_ORG.slug, "video-workload organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === WL_OWNER.id && a.email === WL_OWNER.email), "video-workload organisation has an unknown account")
    assert(previous.volunteers.every((v) => WL_PERSON_EMAIL.test(v.email ?? "")), "video-workload organisation has an unknown member")
    assert(previous.events.every((e) => e.id === WL_EVENT.id), "video-workload organisation has an unknown event")
    // Cascades remove places, shifts, registrations and personal limits of the fixture.
    await db.event.deleteMany({ where: { organizationId: WL_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: WL_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: WL_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: WL_ORG.slug } }), 0, "slug formation-charge already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: WL_OWNER.email } }), 0, "owner address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: WL_ORG.name, timeZone: TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(),
    // The personal page's « écrire à l'organisation » link (MyWorkloadCard) reads this address.
    replyToEmail: WL_OWNER.email,
    volunteerCharter: "Je viens à l'heure à mes créneaux, je préviens si j'ai un empêchement et je suis les consignes des responsables.",
    betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: false,
  }
  if (previous) await db.organization.update({ where: { id: WL_ORG.id }, data: org })
  else await db.organization.create({ data: { id: WL_ORG.id, slug: WL_ORG.slug, ...org } })
  const owner = { organizationId: WL_ORG.id, email: WL_OWNER.email, name: fullNameOf(WL_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: WL_OWNER.id }, create: { id: WL_OWNER.id, ...owner }, update: owner })
  // Level 2 of the beta gate, once the owner exists: the organisation takes part, joined by its owner.
  await db.organization.update({ where: { id: WL_ORG.id }, data: { betaOptInAt: new Date(), betaOptInById: WL_OWNER.id } })

  // Repeated local takes share one browser IP and the same fictitious recipients: stale counters
  // of an earlier take must not hold this one's sign-up or emails (seed-demo.ts does the same).
  await db.rateLimit.deleteMany()
}

/**
 * WORKLOAD_PROTECTION: « Protection des pauses et de la charge » open for trial, the organisation
 * taking part, the event's protection off and without values, eight confirmed people.
 */
export async function seedVideoWorkloadProtection(db: Db) {
  await resetOrganization(db)
  // Level 1 of the beta gate: only this capability is open (the operator's list is platform-wide).
  const value = { open: ["workloadProtection"] }
  await db.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value }, update: { value } })

  const firstDay = fridayAfter(localToday(new Date()), 14)
  const event = await db.event.create({
    data: {
      id: WL_EVENT.id, organizationId: WL_ORG.id, slug: WL_EVENT.slug, title: WL_EVENT.title,
      description: "Trois jours au bord du lac : la Grande Scène, la Scène du Lac, le Chapiteau et Le Dôme comptent sur leurs bénévoles pour l'accueil, le bar et le vestiaire.",
      location: "Rives du lac, Montvert", publicStatus: "published", registrationsOpen: true, remindersEnabled: false,
      startDate: new Date(firstDay), endDate: new Date(addDays(firstDay, 2)),
      workloadProtectionEnabled: false,
    },
  })
  const placeIds = new Map<string, string>()
  for (const [index, name] of WL_PLACES.entries()) {
    const place = await db.eventPlace.create({ data: { id: `video-workload-place-${index}`, eventId: event.id, name, displayOrder: index } })
    placeIds.set(name, place.id)
  }
  const volunteerIds = new Map<string, string>()
  for (const [key, firstName] of Object.entries(WL_PEOPLE)) {
    const volunteer = await db.volunteer.create({ data: { id: `video-workload-person-${key}`, organizationId: WL_ORG.id, firstName, lastName: surnameOf(firstName), email: email(key) } })
    volunteerIds.set(key, volunteer.id)
  }
  const count = new Map<string, number>()
  for (const [order, poste] of WL_POSTES.entries()) {
    for (const s of poste.shifts) {
      const shift = await db.shift.create({ data: {
        id: wlShiftId(s.key), eventId: event.id, roleName: poste.roleName, label: poste.roleName, date: new Date(addDays(firstDay, s.day)),
        startTime: s.start, endTime: s.end, capacity: s.capacity, displayOrder: order, colorKey: poste.colorKey,
        locationDetails: poste.locationDetails, placeId: poste.place ? placeIds.get(poste.place)! : null, mealOnTheGo: false,
      } })
      for (const key of s.people) {
        const n = (count.get(key) ?? 0) + 1
        count.set(key, n)
        await db.registration.create({ data: { eventId: event.id, shiftId: shift.id, volunteerId: volunteerIds.get(key)!, status: "active", source: "public_form", ...registrationToken.data(wlToken(key, n)) } })
      }
    }
  }
  assert.equal(await db.eventVolunteerLimit.count({ where: { eventId: event.id } }), 0)
  assert.equal(await db.volunteer.count({ where: { organizationId: WL_ORG.id, email: email(WL_NEWCOMER.key) } }), 0)
  console.log(`✓ Workload protection fixture: « Protection des pauses et de la charge » open, « ${WL_ORG.name} » taking part, « ${WL_EVENT.title} » from ${firstDay} to ${addDays(firstDay, 2)}, protection off, ${WL_PLACES.length} places, ${volunteerIds.size} confirmed people; Sarah's page /my/${wlToken("sarah")}`)
}
