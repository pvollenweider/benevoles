// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the ASSIGNMENT_PUBLICATION video (#1172): publishing the drafts, the volunteers'
 * emails, and what they can still do afterwards. It continues ASSIGNMENT_PROPOSALS: the same
 * « Rencontres du Val d'Orsel », the same people, postes, shifts and answers
 * (scripts/seed-video-proposals.ts), with the 29 drafts that take ends with (the proposal, Léa's
 * Friday ticket office removed, Lou added on it). videos/lib/__tests__/proposals-fixture.test.ts
 * checks that PB_PLAN is exactly that result.
 *
 * Its own organisation, « Association des Rencontres du Val d'Orsel » (`video-publication`, slug
 * `formation-publication`), owner Colette, members on video.publication.*@example.org: the take
 * publishes for real, so the proposals take's fixture is never touched. Never the demo organisation.
 *
 * The beta gate holds exactly what the take needs: `availability` (the drafts, the publication, the
 * correction after it) and `workloadProtection` (the event's protection, on as in the proposals take,
 * checked again at publication). The proposal itself is not used: the drafts are seeded as the
 * organiser's own (« Brouillon »), and `assignmentProposals` stays closed. No swap either.
 *
 * Nobody is registered, no email is queued; the availability requests carry no link yet: the take's
 * preparation sends Emma a real one through the organisers' route, off screen. No answer deadline:
 * a person with a published mission may correct their answers (the page says the correction cancels
 * nothing). Reset guards as for the proposals fixture: an existing `video-publication` organisation
 * is emptied only when every account, member and event in it is one of this fixture's. Called through
 * scripts/seed-video-scenario.ts, which refuses any database but the video one.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { readAnswerForFit } from "../src/lib/availability-assist-data"
import { BETA_SETTING_KEY, type BetaCapabilityId } from "../src/lib/beta-capabilities"
import { draftAvailabilityStamp, draftShiftTerms } from "../src/lib/draft-assignments"
import { availabilityDates } from "../src/lib/event-availability"
import { addDays } from "../src/lib/shift-series"
import { buildPolicy } from "../src/lib/workload-policy"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { localToday } from "./seed-video-beta"
import { PR_EVENT, PR_ORG, PR_OWNER, PR_PEOPLE, PR_PLACES, PR_POLICY_VALUES, PR_POSTES, PR_TIME_ZONE, resolvedAnswer } from "./seed-video-proposals"
import { fridayAfter } from "./seed-video-workload"

export const PB_ORG = { id: "video-publication", slug: "formation-publication", name: PR_ORG.name } as const
export const PB_OWNER = { id: "video-publication-owner", email: "video.publication.owner@example.org", firstName: PR_OWNER.firstName } as const
export const PB_EVENT = { id: "video-publication-event", slug: PR_EVENT.slug, title: PR_EVENT.title } as const
/** Every member address of the fixture, the owner's included; the mailbox cleanup uses the same rule. */
export const PB_PERSON_EMAIL = /^video\.publication\.[a-z]+@example\.org$/
/** Exactly the capabilities the take needs, and nothing else (platform-wide list). */
export const PB_BETA_OPEN: BetaCapabilityId[] = ["workloadProtection", "availability"]

/**
 * The drafts waiting for publication, by person: the shifts (keys of PR_POSTES) ASSIGNMENT_PROPOSALS
 * ends with. 29 drafts for 11 people; Jules, who never answered, has none.
 */
export const PB_PLAN: Record<string, string[]> = {
  aline: ["acc-fri-pm", "acc-sat-am", "acc-sat-pm"],
  camille: ["acc-sun-pm", "bar-fri", "bar-sat", "bil-sun"],
  emma: ["bar-fri", "bar-sat"],
  lea: ["acc-fri-pm", "acc-sun-am", "acc-sun-pm"],
  lou: ["acc-fri-pm", "acc-sat-pm", "bil-fri", "bil-sat"],
  lucas: ["acc-sat-am", "acc-sat-pm", "bar-sun"],
  nicolas: ["bar-sat", "bar-sun"],
  noah: ["acc-sat-am", "par-sun"],
  paul: ["acc-sun-am", "acc-sun-pm", "par-sat"],
  sarah: ["acc-sun-am", "bar-fri"],
  zoe: ["bar-sun"],
}

export const pbShiftId = (key: string) => `video-publication-shift-${key}`
export const pbPersonId = (key: string) => `video-publication-person-${key}`
export const pbEmail = (key: string) => `video.publication.${key}@example.org`

type Db = PrismaClient

async function resetOrganization(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: PB_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, PB_ORG.slug, "video-publication organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === PB_OWNER.id && a.email === PB_OWNER.email), "video-publication organisation has an unknown account")
    assert(previous.volunteers.every((v) => PB_PERSON_EMAIL.test(v.email ?? "")), "video-publication organisation has an unknown member")
    assert(previous.events.every((e) => e.id === PB_EVENT.id), "video-publication organisation has an unknown event")
    // Cascades remove places, shifts, answers, drafts, publications and registrations of the fixture.
    await db.event.deleteMany({ where: { organizationId: PB_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: PB_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: PB_ORG.id } })
    // The take's emails (placements, withdrawal, availability) of an earlier take, sent or not.
    await db.notificationOutbox.deleteMany({ where: { organizationId: PB_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: PB_ORG.slug } }), 0, "slug formation-publication already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: PB_OWNER.email } }), 0, "owner address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: PB_ORG.name, timeZone: PR_TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(), replyToEmail: PB_OWNER.email,
    volunteerCharter: "Je viens à l'heure à mes créneaux, je préviens si j'ai un empêchement et je suis les consignes des responsables.",
    betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: false,
  }
  if (previous) await db.organization.update({ where: { id: PB_ORG.id }, data: org })
  else await db.organization.create({ data: { id: PB_ORG.id, slug: PB_ORG.slug, ...org } })
  const owner = { organizationId: PB_ORG.id, email: PB_OWNER.email, name: fullNameOf(PB_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: PB_OWNER.id }, create: { id: PB_OWNER.id, ...owner }, update: owner })
  // Level 2 of the beta gate, once the owner exists: the organisation takes part, joined by its owner.
  await db.organization.update({ where: { id: PB_ORG.id }, data: { betaOptInAt: new Date(), betaOptInById: PB_OWNER.id } })
  // Repeated local takes share one browser IP: stale counters of an earlier take must not hold this one.
  await db.rateLimit.deleteMany()
}

/**
 * ASSIGNMENT_PUBLICATION: the proposals take's event in its own organisation, its 29 drafts waiting
 * for « Publier les affectations », nobody registered, no email queued.
 */
export async function seedVideoAssignmentPublication(db: Db) {
  await resetOrganization(db)
  // Level 1 of the beta gate: exactly these capabilities are open (the operator's list is platform-wide).
  const value = { open: PB_BETA_OPEN }
  await db.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value }, update: { value } })

  const firstDay = fridayAfter(localToday(new Date()), 14)
  const now = new Date()
  const event = await db.event.create({
    data: {
      id: PB_EVENT.id, organizationId: PB_ORG.id, slug: PB_EVENT.slug, title: PB_EVENT.title,
      description: "Trois jours de concerts et d'ateliers sous les tilleuls du Val d'Orsel : l'accueil, la billetterie, le bar, le parking et le rangement comptent sur leurs bénévoles.",
      location: "Pré des Tilleuls, Val d'Orsel", publicStatus: "published", registrationsOpen: true, remindersEnabled: false,
      startDate: new Date(firstDay), endDate: new Date(addDays(firstDay, 2)),
      workloadProtectionEnabled: true, workloadPolicy: buildPolicy(PR_POLICY_VALUES, PR_TIME_ZONE),
      availabilityEnabled: true, availabilityAdoptedAt: now, availabilityTimeZone: PR_TIME_ZONE,
    },
  })
  const placeIds = new Map<string, string>()
  for (const [index, name] of PR_PLACES.entries()) {
    const place = await db.eventPlace.create({ data: { id: `video-publication-place-${index}`, eventId: event.id, name, displayOrder: index } })
    placeIds.set(name, place.id)
  }
  for (const [order, poste] of PR_POSTES.entries()) {
    for (const s of poste.shifts) {
      await db.shift.create({ data: {
        id: pbShiftId(s.key), eventId: event.id, roleName: poste.roleName, label: poste.roleName, date: new Date(addDays(firstDay, s.day)),
        startTime: s.start, endTime: s.end, capacity: s.capacity, displayOrder: order, colorKey: poste.colorKey,
        locationDetails: poste.locationDetails, placeId: placeIds.get(poste.place)!, mealOnTheGo: poste.mealOnTheGo,
      } })
    }
  }
  const dates = availabilityDates(event.startDate, event.endDate)
  for (const [key, person] of Object.entries(PR_PEOPLE)) {
    const volunteer = await db.volunteer.create({ data: { id: pbPersonId(key), organizationId: PB_ORG.id, firstName: person.firstName, lastName: surnameOf(person.firstName), email: pbEmail(key) } })
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

  // The drafts, stamped as the product stamps a draft it writes (src/lib/draft-assignments-server.ts
  // createDraft): the shift's terms and the answer as they are now, reviewed by the owner.
  for (const [key, shiftKeys] of Object.entries(PB_PLAN)) {
    const answer = await readAnswerForFit(db, event.id, pbPersonId(key))
    assert(answer, `${key} has an answer`)
    for (const shiftKey of shiftKeys) {
      const shift = await db.shift.findUniqueOrThrow({ where: { id: pbShiftId(shiftKey) } })
      await db.draftAssignment.create({
        data: {
          eventId: event.id, shiftId: shift.id, volunteerId: pbPersonId(key), source: "manual", createdById: PB_OWNER.id,
          shiftTerms: draftShiftTerms(shift), availabilityStamp: draftAvailabilityStamp(answer, shift, PR_TIME_ZONE),
          reviewedAt: now, reviewedById: PB_OWNER.id,
        },
      })
    }
  }
  assert.equal(await db.registration.count({ where: { eventId: event.id } }), 0)
  assert.equal(await db.draftAssignment.count({ where: { eventId: event.id, status: "draft" } }), 29)
  assert.equal(await db.notificationOutbox.count({ where: { organizationId: PB_ORG.id } }), 0)
  console.log(`✓ Assignment publication fixture: ${PB_BETA_OPEN.join(", ")} open, « ${PB_ORG.name} » (${PB_ORG.slug}) taking part, « ${PB_EVENT.title} » from ${firstDay} to ${addDays(firstDay, 2)}, 29 drafts for 11 people, no registration, no email`)
}
