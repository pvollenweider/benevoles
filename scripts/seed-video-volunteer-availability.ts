// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the VOLUNTEER_EVENT_AVAILABILITY video (#1146): the volunteer's side of the dated
 * availability, the link « Indiquer mes disponibilités » and its page « Mes disponibilités pour … ».
 * One dedicated synthetic organisation, « Association des Lanternes de Combe-Aurel »
 * (`video-event-availability`, slug `formation-disponibilites`), with its owner. Never the demo
 * organisation, never another video's one.
 *
 * The beta gate is set the way the app reads it (src/lib/beta-capabilities.ts, beta-access.ts): the
 * operator's open list in PlatformSetting `beta.capabilities` holds exactly `availability`, and the
 * organisation takes part (`Organization.betaOptInAt`). The open list is platform-wide:
 * scripts/seed-demo.ts removes it again, so the demo videos never show a beta option.
 *
 * The event, « Fête des Lanternes de Combe-Aurel », runs Friday to Sunday at least two weeks ahead and
 * collects dated availability, with a deadline the Friday one week before at 20:00 (Europe/Zurich).
 * Morgane, an active member, has not been asked yet: no request, no link, no answer. The take asks
 * her off screen through the organisers' real route (POST /api/admin/events/<id>/availability, what
 * « Demander leurs disponibilités » sends), so the link, its secret and the email are the product's
 * own; the recorder reads the link from the delivered email and never prints it.
 *
 * What the narration claims (dates, deadline sentence, saved state) is checked before filming by
 * videos/lib/__tests__/volunteer-availability-fixture.test.ts, with the product's own words.
 *
 * Reset guards: an existing `video-event-availability` organisation is emptied only when every
 * account, member and event in it is one of this fixture's (exact ids and example.org addresses).
 * Anything else stops the seed. Called through scripts/seed-video-scenario.ts, which refuses any
 * database but the video one. Dates are relative to the take, in Europe/Zurich: the video does not rot.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { BETA_SETTING_KEY, type BetaCapabilityId } from "../src/lib/beta-capabilities"
import { addDays } from "../src/lib/shift-series"
import { localDateTimeToUtc } from "../src/lib/time-zone"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"
import { localToday } from "./seed-video-beta"
import { fridayAfter } from "./seed-video-workload"

export const VA_ORG = { id: "video-event-availability", slug: "formation-disponibilites", name: "Association des Lanternes de Combe-Aurel" } as const
export const VA_OWNER = { id: "video-event-availability-owner", email: "video.disponibilites.owner@example.org", firstName: "Élodie" } as const
export const VA_EVENT = { id: "video-event-availability-event", slug: "fete-des-lanternes", title: "Fête des Lanternes de Combe-Aurel" } as const
/** The volunteer of the take: asked off screen at the start of the take, never before. */
export const VA_VOLUNTEER = { id: "video-event-availability-morgane", key: "morgane", firstName: "Morgane", email: "video.disponibilites.morgane@example.org" } as const
/** Every address of the fixture; the mailbox cleanup uses the same rule. */
export const VA_PERSON_EMAIL = /^video\.disponibilites\.[a-z]+@example\.org$/
export const VA_TIME_ZONE = "Europe/Zurich"
/** Exactly the capability the event needs, and nothing else (platform-wide list). */
export const VA_BETA_OPEN: BetaCapabilityId[] = ["availability"]
/** The answer deadline: this many days before the first day, at this local time. */
export const VA_DEADLINE = { daysBefore: 7, time: "20:00" } as const

/** The event's first day (a Friday) for a take on `today` (local date, YYYY-MM-DD). */
export function vaFirstDay(today: string): string {
  return fridayAfter(today, 14)
}

/** The answer deadline of the event that starts on `firstDay`, as stored (UTC instant). */
export function vaDeadline(firstDay: string): Date {
  return localDateTimeToUtc(new Date(`${addDays(firstDay, -VA_DEADLINE.daysBefore)}T00:00:00Z`), VA_DEADLINE.time, VA_TIME_ZONE)
}

type Db = PrismaClient

async function resetOrganization(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: VA_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, VA_ORG.slug, "video-event-availability organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === VA_OWNER.id && a.email === VA_OWNER.email), "video-event-availability organisation has an unknown account")
    assert(previous.volunteers.every((v) => v.id === VA_VOLUNTEER.id && v.email === VA_VOLUNTEER.email), "video-event-availability organisation has an unknown member")
    assert(previous.events.every((e) => e.id === VA_EVENT.id), "video-event-availability organisation has an unknown event")
    // Cascades remove the request, its answers, its outbox rows' event links and the event's log.
    await db.event.deleteMany({ where: { organizationId: VA_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: VA_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: VA_ORG.id } })
    // A take's request email left in the outbox (sent or not) would hold the next take's request back.
    await db.notificationOutbox.deleteMany({ where: { organizationId: VA_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: VA_ORG.slug } }), 0, "slug formation-disponibilites already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: VA_OWNER.email } }), 0, "owner address already used outside the fixture")
    assert.equal(await db.volunteer.count({ where: { email: VA_VOLUNTEER.email } }), 0, "volunteer address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: VA_ORG.name, timeZone: VA_TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(), replyToEmail: VA_OWNER.email,
    volunteerCharter: null, betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: false,
  }
  if (previous) await db.organization.update({ where: { id: VA_ORG.id }, data: org })
  else await db.organization.create({ data: { id: VA_ORG.id, slug: VA_ORG.slug, ...org } })
  const owner = { organizationId: VA_ORG.id, email: VA_OWNER.email, name: fullNameOf(VA_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: VA_OWNER.id }, create: { id: VA_OWNER.id, ...owner }, update: owner })
  // Level 2 of the beta gate, once the owner exists: the organisation takes part, joined by its owner.
  await db.organization.update({ where: { id: VA_ORG.id }, data: { betaOptInAt: new Date(), betaOptInById: VA_OWNER.id } })

  // Repeated local takes share one browser IP: stale counters of an earlier take must not hold this one.
  await db.rateLimit.deleteMany()
}

/**
 * VOLUNTEER_EVENT_AVAILABILITY: dated availability open for trial, the organisation taking part, the
 * event collecting availability until its deadline, Morgane an active member not asked yet.
 */
export async function seedVideoVolunteerAvailability(db: Db) {
  await resetOrganization(db)
  // Level 1 of the beta gate: exactly this capability is open (the operator's list is platform-wide).
  const value = { open: VA_BETA_OPEN }
  await db.platformSetting.upsert({ where: { key: BETA_SETTING_KEY }, create: { key: BETA_SETTING_KEY, value }, update: { value } })

  const firstDay = vaFirstDay(localToday(new Date()))
  const deadline = vaDeadline(firstDay)
  assert(deadline.getTime() > Date.now() + 24 * 3600_000, "the deadline must stay ahead of the take")
  const event = await db.event.create({
    data: {
      id: VA_EVENT.id, organizationId: VA_ORG.id, slug: VA_EVENT.slug, title: VA_EVENT.title,
      description: "Trois soirs de lanternes, de musique et de cuisine dans les ruelles de Combe-Aurel : l'organisation prépare son planning d'après les disponibilités de chacun.",
      location: "Place des Lanternes, Combe-Aurel", publicStatus: "draft", registrationsOpen: false, remindersEnabled: false,
      startDate: new Date(firstDay), endDate: new Date(addDays(firstDay, 2)),
      availabilityEnabled: true, availabilityAdoptedAt: new Date(), availabilityTimeZone: VA_TIME_ZONE, availabilityDeadline: deadline,
    },
  })
  await db.volunteer.create({ data: { id: VA_VOLUNTEER.id, organizationId: VA_ORG.id, firstName: VA_VOLUNTEER.firstName, lastName: surnameOf(VA_VOLUNTEER.firstName), email: VA_VOLUNTEER.email } })
  assert.equal(await db.availabilityRequest.count({ where: { eventId: event.id } }), 0)
  assert.equal(await db.notificationOutbox.count({ where: { organizationId: VA_ORG.id } }), 0)
  console.log(`✓ Volunteer event availability fixture: « ${VA_EVENT.title} » from ${firstDay} to ${addDays(firstDay, 2)}, collecting availability until ${deadline.toISOString()}, « ${VA_ORG.name} » taking part (beta open: ${VA_BETA_OPEN.join(", ")}), ${fullNameOf(VA_VOLUNTEER.firstName)} not asked yet`)
}
