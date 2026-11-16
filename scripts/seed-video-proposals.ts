// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the ASSIGNMENT_PROPOSALS video (#1172): « Proposition d'affectations », in beta. One
 * dedicated synthetic organisation, « Association des Rencontres du Val d'Orsel »
 * (`video-proposals`, slug `formation-propositions`), with its owner. Never the demo organisation,
 * never the beta or workload videos' one.
 *
 * The beta gate is set the way the app reads it (src/lib/beta-capabilities.ts, beta-access.ts): the
 * operator's open list in PlatformSetting `beta.capabilities` holds exactly what the page needs,
 * `availability`, `workloadProtection` and `assignmentProposals`, and the organisation takes part
 * (`Organization.betaOptInAt`). The open list is platform-wide: scripts/seed-demo.ts removes it
 * again, so the demo videos never show a beta option.
 *
 * The event, « Rencontres du Val d'Orsel », runs Friday to Sunday at least two weeks ahead. It
 * already collects dated availability (eleven people answered, Jules was asked and has not) and
 * its workload protection is on and complete, with the owner's pilot values (src/lib/workload-policy.ts
 * benchmarks, 20 h over the event, 3 h of waiting, no days-off rule for three days, no minors rule).
 * Nobody is registered and no draft exists yet: the take generates them. No hour target is stored:
 * the take applies the suggestion, then lowers one person's target.
 *
 * The take's result is judged before filming by videos/lib/__tests__/proposals-fixture.test.ts,
 * which runs the product's own solver on this input with the values the recorder types: every seat
 * is covered except the two of « Rangement du Kiosque », which nobody's availability covers.
 *
 * Reset guards: an existing `video-proposals` organisation is emptied only when every account,
 * member and event in it is one of this fixture's (exact ids and example.org addresses). Anything
 * else stops the seed. Called through scripts/seed-video-scenario.ts, which refuses any database
 * but the video one. Dates are relative to the take, in Europe/Zurich: the video does not rot.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { BETA_SETTING_KEY, type BetaCapabilityId } from "../src/lib/beta-capabilities"
import { availabilityDates, resolveDay } from "../src/lib/event-availability"
import { addDays } from "../src/lib/shift-series"
import { buildPolicy, WORKLOAD_BENCHMARKS, type WorkloadPolicyValues } from "../src/lib/workload-policy"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { localToday } from "./seed-video-beta"
import { fridayAfter } from "./seed-video-workload"

export const PR_ORG = { id: "video-proposals", slug: "formation-propositions", name: "Association des Rencontres du Val d'Orsel" } as const
export const PR_OWNER = { id: "video-proposals-owner", email: "video.proposals.owner@example.org", firstName: "Colette" } as const
export const PR_EVENT = { id: "video-proposals-event", slug: "rencontres-du-val", title: "Rencontres du Val d'Orsel" } as const
/** Every member address of the fixture; the mailbox cleanup uses the same rule. */
export const PR_PERSON_EMAIL = /^video\.proposals\.[a-z]+@example\.org$/
export const PR_TIME_ZONE = "Europe/Zurich"
/** Exactly the capabilities the page needs, and nothing else (platform-wide list). */
export const PR_BETA_OPEN: BetaCapabilityId[] = ["workloadProtection", "availability", "assignmentProposals"]

const email = (key: string) => `video.proposals.${key}@example.org`

/** A free range of one date, local "HH:MM"; an end before the start is the next morning. */
export type PrRange = { start: string; end: string }
/**
 * One person's answer, by day from the Friday (0, 1, 2): free ranges, an empty list for « Pas
 * disponible », absent for no answer that date. `answer: null`: asked, never answered.
 */
export type PrPerson = { firstName: string; answer: Partial<Record<0 | 1 | 2, PrRange[]>> | null }

/** The people asked for their availability (key → cast first name and answer). */
export const PR_PEOPLE: Record<string, PrPerson> = {
  aline: { firstName: "Aline", answer: { 0: [{ start: "14:00", end: "23:00" }], 1: [{ start: "09:00", end: "18:00" }], 2: [] } },
  nicolas: { firstName: "Nicolas", answer: { 0: [], 1: [{ start: "16:00", end: "23:30" }], 2: [{ start: "13:00", end: "22:00" }] } },
  lea: { firstName: "Léa", answer: { 0: [{ start: "13:00", end: "21:00" }], 1: [], 2: [{ start: "09:00", end: "18:00" }] } },
  noah: { firstName: "Noah", answer: { 0: [], 1: [{ start: "09:00", end: "14:00" }], 2: [{ start: "09:00", end: "14:00" }] } },
  sarah: { firstName: "Sarah", answer: { 0: [{ start: "16:00", end: "23:00" }], 1: [], 2: [{ start: "09:00", end: "13:00" }] } },
  lucas: { firstName: "Lucas", answer: { 0: [], 1: [{ start: "09:00", end: "23:00" }], 2: [{ start: "09:00", end: "23:00" }] } },
  camille: { firstName: "Camille", answer: { 0: [{ start: "13:00", end: "23:00" }], 1: [{ start: "13:00", end: "23:00" }], 2: [{ start: "13:00", end: "22:00" }] } },
  zoe: { firstName: "Zoé", answer: { 0: [], 1: [], 2: [{ start: "09:00", end: "22:00" }] } },
  emma: { firstName: "Emma", answer: { 0: [{ start: "17:00", end: "23:00" }], 1: [{ start: "17:00", end: "23:00" }], 2: [] } },
  paul: { firstName: "Paul", answer: { 0: [], 1: [{ start: "09:00", end: "18:00" }], 2: [{ start: "09:00", end: "18:00" }] } },
  lou: { firstName: "Lou", answer: { 0: [{ start: "13:00", end: "20:00" }], 1: [{ start: "13:00", end: "20:00" }], 2: [] } },
  jules: { firstName: "Jules", answer: null },
}

/** Places of the event, in order. */
export const PR_PLACES = ["Entrée du site", "Scène des Tilleuls", "Kiosque"] as const

export type PrShift = { key: string; day: 0 | 1 | 2; start: string; end: string; capacity: number }
export type PrPoste = { roleName: string; colorKey: string; locationDetails: string; place: (typeof PR_PLACES)[number]; mealOnTheGo: boolean; shifts: PrShift[] }

/** Postes and shifts; `day` counts from the Friday. Nobody is registered: the take proposes. */
export const PR_POSTES: PrPoste[] = [
  { roleName: "Accueil", colorKey: "sky", locationDetails: "Tente d'accueil, à l'entrée du site", place: "Entrée du site", mealOnTheGo: false, shifts: [
    { key: "acc-fri-pm", day: 0, start: "14:00", end: "17:00", capacity: 3 },
    { key: "acc-sat-am", day: 1, start: "10:00", end: "13:00", capacity: 3 },
    { key: "acc-sat-pm", day: 1, start: "14:00", end: "17:00", capacity: 3 },
    { key: "acc-sun-am", day: 2, start: "10:00", end: "13:00", capacity: 3 },
    { key: "acc-sun-pm", day: 2, start: "14:00", end: "17:00", capacity: 3 },
  ] },
  { roleName: "Billetterie", colorKey: "violet", locationDetails: "Caisse à l'entrée du site", place: "Entrée du site", mealOnTheGo: false, shifts: [
    { key: "bil-fri", day: 0, start: "17:00", end: "20:00", capacity: 1 },
    { key: "bil-sat", day: 1, start: "17:00", end: "20:00", capacity: 1 },
    { key: "bil-sun", day: 2, start: "17:00", end: "20:00", capacity: 1 },
  ] },
  { roleName: "Bar des Tilleuls", colorKey: "amber", locationDetails: "Bar à droite de la Scène des Tilleuls", place: "Scène des Tilleuls", mealOnTheGo: true, shifts: [
    { key: "bar-fri", day: 0, start: "18:00", end: "22:00", capacity: 3 },
    { key: "bar-sat", day: 1, start: "18:00", end: "22:00", capacity: 3 },
    { key: "bar-sun", day: 2, start: "17:00", end: "21:00", capacity: 3 },
  ] },
  { roleName: "Parking", colorKey: "stone", locationDetails: "Pré du parking, route du Val", place: "Entrée du site", mealOnTheGo: false, shifts: [
    { key: "par-sat", day: 1, start: "10:00", end: "13:00", capacity: 1 },
    { key: "par-sun", day: 2, start: "10:00", end: "13:00", capacity: 1 },
  ] },
  { roleName: "Rangement du Kiosque", colorKey: "emerald", locationDetails: "Kiosque, derrière la Scène des Tilleuls", place: "Kiosque", mealOnTheGo: false, shifts: [
    { key: "ran-sun", day: 2, start: "21:30", end: "00:30", capacity: 2 },
  ] },
]

/** The shift of a key. */
export const prShiftId = (key: string) => `video-proposals-shift-${key}`
/** The member of a key. */
export const prPersonId = (key: string) => `video-proposals-person-${key}`

const benchmark = (id: string) => {
  const found = WORKLOAD_BENCHMARKS.find((b) => b.id === id)
  if (!found) throw new Error(`No workload benchmark ${id}`)
  return found
}

/**
 * The event's protection, on and complete: the « Repères et suggestions » values for the daily
 * duty, rest, break, meal and travel, 20 h over the event, 3 h of waiting at most; the days-off
 * and minors rules are answered « Ne pas appliquer » (a three-day event, adult volunteers).
 */
export const PR_POLICY_VALUES: WorkloadPolicyValues = {
  serviceDayStart: "06:00",
  maxContinuousMinutes: benchmark("break").limits!.maxContinuousMinutes!,
  minBreakMinutes: benchmark("break").limits!.minBreakMinutes!,
  maxDailyMinutes: benchmark("daily").limits!.maxDailyMinutes!,
  maxEventMinutes: 20 * 60,
  minRestMinutes: benchmark("rest").limits!.minRestMinutes!,
  maxIdleGapMinutes: 3 * 60,
  offDay: { apply: false },
  meal: benchmark("meal").meal!,
  travel: benchmark("travel").travel!,
  minors: { apply: false },
}

type Db = PrismaClient

async function resetOrganization(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: PR_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, PR_ORG.slug, "video-proposals organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === PR_OWNER.id && a.email === PR_OWNER.email), "video-proposals organisation has an unknown account")
    assert(previous.volunteers.every((v) => PR_PERSON_EMAIL.test(v.email ?? "")), "video-proposals organisation has an unknown member")
    assert(previous.events.every((e) => e.id === PR_EVENT.id), "video-proposals organisation has an unknown event")
    // Cascades remove places, shifts, answers, targets, drafts, runs and registrations of the fixture.
    await db.event.deleteMany({ where: { organizationId: PR_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: PR_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: PR_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: PR_ORG.slug } }), 0, "slug formation-propositions already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: PR_OWNER.email } }), 0, "owner address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: PR_ORG.name, timeZone: PR_TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(), replyToEmail: PR_OWNER.email,
    volunteerCharter: "Je viens à l'heure à mes créneaux, je préviens si j'ai un empêchement et je suis les consignes des responsables.",
    betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: false,
  }
  if (previous) await db.organization.update({ where: { id: PR_ORG.id }, data: org })
  else await db.organization.create({ data: { id: PR_ORG.id, slug: PR_ORG.slug, ...org } })
  const owner = { organizationId: PR_ORG.id, email: PR_OWNER.email, name: fullNameOf(PR_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: PR_OWNER.id }, create: { id: PR_OWNER.id, ...owner }, update: owner })
  // Level 2 of the beta gate, once the owner exists: the organisation takes part, joined by its owner.
  await db.organization.update({ where: { id: PR_ORG.id }, data: { betaOptInAt: new Date(), betaOptInById: PR_OWNER.id } })

  // Repeated local takes share one browser IP: stale counters of an earlier take must not hold this one.
  await db.rateLimit.deleteMany()
}

/** The answer of a person as it is stored: each answered date of the event with its resolved ranges. */
export function resolvedAnswer(person: PrPerson, firstDay: string) {
  if (!person.answer) return []
  return (Object.entries(person.answer) as [string, PrRange[]][]).map(([day, ranges]) => {
    const resolved = resolveDay({ date: addDays(firstDay, Number(day)), ranges }, PR_TIME_ZONE)
    if (!resolved.ok) throw new Error(resolved.error)
    return resolved.value
  })
}

/**
 * ASSIGNMENT_PROPOSALS: « Proposition d'affectations » open for trial with the two capabilities it
 * builds on, the organisation taking part, the event collecting availability with eleven answers
 * and Jules without one, its protection on and complete, no registration, no draft, no target.
 */
export async function seedVideoAssignmentProposals(db: Db) {
  await resetOrganization(db)
  // Level 1 of the beta gate: exactly these capabilities are open (the operator's list is platform-wide).
  const value = { open: PR_BETA_OPEN }
  await db.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value }, update: { value } })

  const firstDay = fridayAfter(localToday(new Date()), 14)
  const now = new Date()
  const event = await db.event.create({
    data: {
      id: PR_EVENT.id, organizationId: PR_ORG.id, slug: PR_EVENT.slug, title: PR_EVENT.title,
      description: "Trois jours de concerts et d'ateliers sous les tilleuls du Val d'Orsel : l'accueil, la billetterie, le bar, le parking et le rangement comptent sur leurs bénévoles.",
      location: "Pré des Tilleuls, Val d'Orsel", publicStatus: "published", registrationsOpen: true, remindersEnabled: false,
      startDate: new Date(firstDay), endDate: new Date(addDays(firstDay, 2)),
      workloadProtectionEnabled: true, workloadPolicy: buildPolicy(PR_POLICY_VALUES, PR_TIME_ZONE),
      availabilityEnabled: true, availabilityAdoptedAt: now, availabilityTimeZone: PR_TIME_ZONE,
    },
  })
  const placeIds = new Map<string, string>()
  for (const [index, name] of PR_PLACES.entries()) {
    const place = await db.eventPlace.create({ data: { id: `video-proposals-place-${index}`, eventId: event.id, name, displayOrder: index } })
    placeIds.set(name, place.id)
  }
  for (const [order, poste] of PR_POSTES.entries()) {
    for (const s of poste.shifts) {
      await db.shift.create({ data: {
        id: prShiftId(s.key), eventId: event.id, roleName: poste.roleName, label: poste.roleName, date: new Date(addDays(firstDay, s.day)),
        startTime: s.start, endTime: s.end, capacity: s.capacity, displayOrder: order, colorKey: poste.colorKey,
        locationDetails: poste.locationDetails, placeId: placeIds.get(poste.place)!, mealOnTheGo: poste.mealOnTheGo,
      } })
    }
  }
  const dates = availabilityDates(event.startDate, event.endDate)
  for (const [key, person] of Object.entries(PR_PEOPLE)) {
    const volunteer = await db.volunteer.create({ data: { id: prPersonId(key), organizationId: PR_ORG.id, firstName: person.firstName, lastName: surnameOf(person.firstName), email: email(key) } })
    const days = resolvedAnswer(person, firstDay)
    assert(days.every((d) => dates.includes(d.date)), "an answer date is outside the event")
    await db.availabilityRequest.create({
      data: {
        eventId: event.id, volunteerId: volunteer.id, revision: person.answer ? 1 : 0, sentAt: now,
        ...(person.answer ? { answeredAt: now, answeredBy: "volunteer" } : {}),
        days: { create: days.map((d) => ({ eventId: event.id, date: new Date(`${d.date}T00:00:00Z`), ranges: { create: d.ranges.map((r) => ({ eventId: event.id, startTime: r.startTime, endTime: r.endTime, startsAt: r.startsAt, endsAt: r.endsAt })) } })) },
      },
    })
  }
  assert.equal(await db.registration.count({ where: { eventId: event.id } }), 0)
  assert.equal(await db.eventVolunteerTarget.count({ where: { eventId: event.id } }), 0)
  const shiftCount = PR_POSTES.reduce((n, p) => n + p.shifts.length, 0)
  console.log(`✓ Assignment proposals fixture: « Proposition d'affectations » open with ${PR_BETA_OPEN.join(", ")}, « ${PR_ORG.name} » taking part, « ${PR_EVENT.title} » from ${firstDay} to ${addDays(firstDay, 2)}, protection on, ${shiftCount} shifts, ${Object.keys(PR_PEOPLE).length} people asked (1 without answer), no registration, no draft`)
}
