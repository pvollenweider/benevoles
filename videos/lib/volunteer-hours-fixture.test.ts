// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { HOURS_ORG, HOURS_OWNER, HOURS_ROWS, assertOwnedHoursFixture } from "./volunteer-hours-fixture"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { test } from "vitest"

test("volunteer-hours-fixture guards", async () => {

  const fixture = () => {
    const registrations = HOURS_ROWS.map(([key, member, event, day, status, , , , checked]) => ({ id: `${HOURS_ORG}-registration-${key}`, eventId: `${HOURS_ORG}-event-${event}`, shiftId: `${HOURS_ORG}-shift-${key}`, volunteerId: `${HOURS_ORG}-${member}`, status, source: "admin_manual", checkedInAt: checked ? new Date(`${day}T08:00:00Z`) : null }))
    return {
      id: HOURS_ORG, name: "Formation — heures et attestations", slug: "formation-heures", timeZone: "Europe/Zurich", replyToEmail: HOURS_OWNER, active: true,
      admins: [{ id: `${HOURS_ORG}-owner`, email: HOURS_OWNER, role: "admin", isActive: true }],
      slugHistory: [], logs: [], targetedMessages: [], messageTemplates: [], duplicateDismissals: [], charterVersions: [], logo: null, erasureRecords: [],
      volunteers: [["aline", "Aline"], ["benoit", "Benoît"], ["clara", "Clara"]].map(([id, name]) => ({ id: `${HOURS_ORG}-${id}`, organizationId: HOURS_ORG, firstName: name, lastName: "Exemple", email: `video.hours.${id}@example.org`, active: true, phone: null, tags: [], mergedIntoId: null, erasedAt: null, registrations: registrations.filter(r => r.volunteerId === `${HOURS_ORG}-${id}`), invites: [], questionAnswers: [], pushSubscriptions: [], deliveryOutcomes: [], mergedFrom: [], duplicateDismissalsAsA: [], duplicateDismissalsAsB: [] })),
      events: [["may", "2026-05-02", "Rencontre de printemps"], ["september", "2026-09-12", "Fête de septembre"], ["future", "2026-11-28", "Préparer la prochaine fête"]].map(([kind, day, title]) => ({ id: `${HOURS_ORG}-event-${kind}`, organizationId: HOURS_ORG, title, slug: `heures-${kind}`, startDate: new Date(`${day}T00:00:00Z`), endDate: new Date(`${day}T00:00:00Z`), publicStatus: "published", isListed: false, remindersEnabled: false, memberInvites: [], logs: [], pages: [], sectorLeaders: [], milestones: [], targetedMessages: [], questions: [], questionAnswers: [], registrations: registrations.filter(r => r.eventId === `${HOURS_ORG}-event-${kind}`), shifts: HOURS_ROWS.filter(r => r[2] === kind).map(([key, , , date, , status, startTime, endTime]) => ({ id: `${HOURS_ORG}-shift-${key}`, eventId: `${HOURS_ORG}-event-${kind}`, roleName: "Accueil", label: `Formation — ${key}`, date: new Date(`${date}T00:00:00Z`), startTime, endTime, status, capacity: 3, reservedTags: [], minAge: null, registrations: registrations.filter(r => r.shiftId === `${HOURS_ORG}-shift-${key}`) })) })),
    }
  }
  type Fixture = ReturnType<typeof fixture>
  const check = (org: Fixture, outbox = 0) => assertOwnedHoursFixture({ organization: { findUniqueOrThrow: async () => org }, notificationOutbox: { count: async () => outbox } } as unknown as PrismaClient)
  async function main() {
  await check(fixture())
  for (const mutate of [
    (org: Fixture) => { org.slug = "default" },
    (org: Fixture) => { org.admins[0].email = "wrong@example.org" },
    (org: Fixture) => { org.volunteers[0].registrations.push({ ...org.volunteers[0].registrations[0], id: "foreign", eventId: "foreign" }) },
    (org: Fixture) => { org.events[0].shifts[0].registrations.push({ ...org.events[0].shifts[0].registrations[0], id: "foreign" }) },
    (org: Fixture) => { org.events[1].registrations[0].status = "cancelled" },
    (org: Fixture) => { org.events[1].registrations[0].source = "admin" },
    (org: Fixture) => { org.events[1].shifts[0].capacity = 20 },
  ]) { const org = fixture(); mutate(org); await assert.rejects(() => check(org)) }
  await assert.rejects(() => check(fixture(), 1))
  }
  main().catch(error => { console.error(error); process.exitCode = 1 })
})
