// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Fixture of the RECURRING_PRESENTATION video (« Des bénévoles chaque semaine, sans refaire le
 * planning »): a repair café that opens a Saturday every other week, all year. One dedicated
 * synthetic organisation, « Repair Café de Montvert » (`video-repair`, slug `repair-cafe-montvert`),
 * in Europe/Zurich (Swiss public holidays), with its organiser Nicolas and a few members. Never the
 * demo organisation, never another video's one.
 *
 * The organisation has no event: the take creates the season from the « Repair café » template,
 * publishes it, and Sarah (a cast name on example.org) signs up for three Saturdays through the
 * public page, then opens « Mes inscriptions » from her real confirmation email.
 *
 * Reset guards: an existing `video-repair` organisation is emptied only when every account, member
 * and event in it is one of this fixture's (exact ids and example.org addresses). Anything else
 * stops the seed. Called through scripts/seed-video-scenario.ts, which refuses any database but the
 * video one.
 */
import assert from "node:assert/strict"
import bcrypt from "bcryptjs"
import type { PrismaClient } from "../src/generated/prisma/client"
import { fullNameOf, surnameOf } from "../videos/lib/fixture-names"

export const RC_ORG = { id: "video-repair", slug: "repair-cafe-montvert", name: "Repair Café de Montvert" } as const
export const RC_OWNER = { id: "video-repair-owner", email: "video.repair.owner@example.org", firstName: "Nicolas" } as const
/** Every member address of the fixture, Sarah's (typed during the take) included. */
export const RC_PERSON_EMAIL = /^video\.repair\.[a-z]+@example\.org$/
/** The volunteer of the story: signs up during the take, so she is not seeded. */
export const RC_VOLUNTEER = { key: "sarah", firstName: "Sarah", email: "video.repair.sarah@example.org" } as const
/** Members already in the organisation (cast names, no phone). */
export const RC_MEMBERS = { aline: "Aline", lucas: "Lucas", camille: "Camille" } as const
const TIME_ZONE = "Europe/Zurich"

const email = (key: string) => `video.repair.${key}@example.org`

type Db = PrismaClient

/** RECURRING_PRESENTATION: an active organisation, its organiser and three members, no event yet. */
export async function seedVideoRepairCafe(db: Db) {
  const previous = await db.organization.findUnique({ where: { id: RC_ORG.id }, include: { admins: true, volunteers: true, events: true } })
  if (previous) {
    assert.equal(previous.slug, RC_ORG.slug, "video-repair organisation has an unexpected slug")
    assert(previous.admins.every((a) => a.id === RC_OWNER.id && a.email === RC_OWNER.email), "video-repair organisation has an unknown account")
    assert(previous.volunteers.every((v) => RC_PERSON_EMAIL.test(v.email ?? "")), "video-repair organisation has an unknown member")
    // Events are created by the take itself (from the template): any event here is a previous take's.
    await db.event.deleteMany({ where: { organizationId: RC_ORG.id } })
    await db.volunteer.deleteMany({ where: { organizationId: RC_ORG.id } })
    await db.orgLog.deleteMany({ where: { organizationId: RC_ORG.id } })
  } else {
    assert.equal(await db.organization.count({ where: { slug: RC_ORG.slug } }), 0, "slug repair-cafe-montvert already used by another organisation")
    assert.equal(await db.adminUser.count({ where: { email: RC_OWNER.email } }), 0, "owner address already used outside the fixture")
  }
  const passwordHash = await bcrypt.hash(process.env.ORG_ADMIN_PASSWORD ?? "e2e-org-admin-password", 10)
  const org = {
    name: RC_ORG.name, timeZone: TIME_ZONE, active: true, suspendedAt: null, hasOrgInsurance: true,
    outboundEmailApprovedAt: new Date(), publicationApprovedAt: new Date(),
    replyToEmail: RC_OWNER.email, volunteerConventionEnabled: true, volunteerCharter: null,
    betaOptInAt: null, betaOptInById: null, sectorsDefault: false, shiftSwapsDefault: false,
  }
  if (previous) await db.organization.update({ where: { id: RC_ORG.id }, data: org })
  else await db.organization.create({ data: { id: RC_ORG.id, slug: RC_ORG.slug, ...org } })
  const owner = { organizationId: RC_ORG.id, email: RC_OWNER.email, name: fullNameOf(RC_OWNER.firstName), role: "admin", isActive: true, passwordHash, receiveProductUpdates: false }
  await db.adminUser.upsert({ where: { id: RC_OWNER.id }, create: { id: RC_OWNER.id, ...owner }, update: owner })
  for (const [key, firstName] of Object.entries(RC_MEMBERS)) {
    await db.volunteer.create({ data: { id: `video-repair-person-${key}`, organizationId: RC_ORG.id, firstName, lastName: surnameOf(firstName), email: email(key) } })
  }
  // Repeated local takes share one browser IP: stale counters of an earlier take must not hold this one.
  await db.rateLimit.deleteMany()
  console.log(`✓ Repair café fixture: « ${RC_ORG.name} » (repair-cafe-montvert), organiser ${RC_OWNER.email}, ${Object.keys(RC_MEMBERS).length} members, no event (the take creates the season)`)
}
