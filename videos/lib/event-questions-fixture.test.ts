// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assertQuestionsReviewFixture, QUESTIONS_DATE, QUESTIONS_EVENT, QUESTIONS_MEMBER, QUESTIONS_ORG, QUESTIONS_EMAIL, QUESTIONS_OWNER, QUESTIONS_SHIFTS } from "./event-questions-fixture"
import { test } from "vitest"

test("event-questions-fixture guards", async () => {

  const cross = { registrations: [], invites: [], questionAnswers: [], pushSubscriptions: [], deliveryOutcomes: [], mergedFrom: [], duplicateDismissalsAsA: [], duplicateDismissalsAsB: [], mergedIntoId: null, erasedAt: null }
  const fixture = {
    id: QUESTIONS_ORG, name: "Formation — questions aux bénévoles", slug: "formation-questions", timeZone: "Europe/Zurich", replyToEmail: QUESTIONS_OWNER, active: true,
    admins: [{ id: `${QUESTIONS_ORG}-owner`, name: "Élodie Exemple", email: QUESTIONS_OWNER, role: "admin", isActive: true }],
    volunteers: [{ id: QUESTIONS_MEMBER, firstName: "Aline", lastName: "Exemple", email: QUESTIONS_EMAIL, phone: null, tags: [], active: true }],
    slugHistory: [], logs: [], targetedMessages: [], messageTemplates: [], duplicateDismissals: [], charterVersions: [], logo: null, erasureRecords: [],
    events: [{ id: QUESTIONS_EVENT, title: "Préparer les questions de l'équipe", slug: "atelier-questions", publicStatus: "published", remindersEnabled: false, startDate: new Date(QUESTIONS_DATE), endDate: new Date(QUESTIONS_DATE),
      pages: [], sectorLeaders: [], milestones: [], targetedMessages: [], registrations: [], logs: [], questions: [], questionAnswers: [],
      memberInvites: [{ id: `${QUESTIONS_ORG}-invite`, volunteerId: QUESTIONS_MEMBER }],
      shifts: QUESTIONS_SHIFTS.map((id, i) => ({ id, eventId: QUESTIONS_EVENT, roleName: "Accueil", label: `Accueil — passage ${i + 1}`, startTime: `${10 + i * 2}:00`, endTime: `${12 + i * 2}:00`, date: new Date(QUESTIONS_DATE), capacity: 4, minAge: null, reservedTags: [], registrations: [] })),
    }],
  }
  function dbFor(org: unknown, member: unknown = cross) {
    return { organization: { findUniqueOrThrow: async () => org }, volunteer: { findUniqueOrThrow: async () => member } } as unknown as Parameters<typeof assertQuestionsReviewFixture>[0]
  }
  async function main() {
  await assertQuestionsReviewFixture(dbFor(fixture))
  await assert.rejects(() => assertQuestionsReviewFixture(dbFor({ ...fixture, slug: "real-org" })))
  await assert.rejects(() => assertQuestionsReviewFixture(dbFor({ ...fixture, volunteers: [{ ...fixture.volunteers[0], email: "person@gmail.com" }] })))
  await assert.rejects(() => assertQuestionsReviewFixture(dbFor({ ...fixture, events: [{ ...fixture.events[0], pages: [{ id: "unknown" }] }] })))
  await assert.rejects(() => assertQuestionsReviewFixture(dbFor(fixture, { ...cross, registrations: [{ eventId: "another-organization-event" }] })))
  await assert.rejects(() => assertQuestionsReviewFixture(dbFor(fixture, { ...cross, deliveryOutcomes: [{ organizationId: "another-org", kind: "registration_confirmation", outcome: "accepted_by_relay" }] })))
  await assert.rejects(() => assertQuestionsReviewFixture(dbFor({ ...fixture, events: [{ ...fixture.events[0], registrations: [{ eventId: QUESTIONS_EVENT, volunteerId: QUESTIONS_MEMBER, shiftId: QUESTIONS_SHIFTS[0], source: "admin_manual", status: "active" }] }] })))
  }
  main().catch(error => { console.error(error); process.exitCode = 1 })
})
