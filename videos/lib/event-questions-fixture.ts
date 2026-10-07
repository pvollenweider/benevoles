// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { register } from "tsx/cjs/api"
import { verifyProductBuild } from "./product-build"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { trainingQuestions, type QuestionSnapshot } from "./record-event-questions"

export const QUESTIONS_ORG = "video-questions"
export const QUESTIONS_EVENT = "video-questions-event"
export const QUESTIONS_MEMBER = "video-questions-aline"
export const QUESTIONS_OWNER = "video.questions.owner@example.org"
export const QUESTIONS_EMAIL = "video.questions.aline@example.org"
export const QUESTIONS_MEMBER_NAME = "Aline Mercier"
export const QUESTIONS_OWNER_NAME = "Élodie Rochat"
export const QUESTIONS_DATE = "2026-11-28T00:00:00.000Z"
export const QUESTIONS_SHIFTS = [0, 1, 2, 3].map(i => `${QUESTIONS_ORG}-shift-${i}`)

/** Read all event children before any cascading owned reset or external review. */
export async function assertQuestionsReviewFixture(db: PrismaClient, identity: "current" | "legacy-owned-reset" = "current") {
  const org = await db.organization.findUniqueOrThrow({ where: { id: QUESTIONS_ORG }, include: {
    admins: true, volunteers: true, slugHistory: true, logs: true, targetedMessages: true, messageTemplates: true,
    duplicateDismissals: true, charterVersions: true, logo: true, erasureRecords: true,
    events: { include: { shifts: { include: { registrations: true } }, registrations: true, memberInvites: true, logs: true, pages: true, sectorLeaders: true, milestones: true, targetedMessages: true, questions: { include: { answers: true } }, questionAnswers: true } },
  } })
  assert(org.name === "Formation — questions aux bénévoles" && org.slug === "formation-questions" && org.timeZone === "Europe/Zurich" && org.replyToEmail === QUESTIONS_OWNER && org.active)
  assert.equal(org.admins.length, 1)
  const legacy = identity === "legacy-owned-reset" && org.admins[0].name === "Élodie Exemple" && org.volunteers[0]?.lastName === "Exemple"
  assert(org.admins[0].id === `${QUESTIONS_ORG}-owner` && org.admins[0].name === (legacy ? "Élodie Exemple" : QUESTIONS_OWNER_NAME) && org.admins[0].email === QUESTIONS_OWNER && org.admins[0].role === "admin" && org.admins[0].isActive)
  assert.equal(org.volunteers.length, 1)
  const member = org.volunteers[0]
  assert(member.id === QUESTIONS_MEMBER && member.firstName === "Aline" && member.lastName === (legacy ? "Exemple" : "Mercier") && member.email === QUESTIONS_EMAIL && !member.phone && member.tags.length === 0 && member.active)
  assert([org.slugHistory, org.logs, org.targetedMessages, org.messageTemplates, org.duplicateDismissals, org.erasureRecords].every(rows => rows.length === 0) && org.logo === null, "Unexpected organization children; refusing owned reset/review")
  // The real public submission creates proof of the convention accepted (#569).
  // Permit only the exact default convention from the verified build, never an
  // arbitrary archived text or another organization's consent history.
  assert(org.charterVersions.length <= 1)
  if (org.charterVersions.length) {
    assert.equal(org.volunteerCharter, null)
    const product = await verifyProductBuild("http://localhost:43112")
    const loader = register({ namespace: `questions-charter-${randomUUID()}` })
    let expected: string
    try {
      expected = loader.require(path.join(product.snapshot, "src/lib/volunteer-charter.ts"), path.join(product.snapshot, "package.json")).resolveCharterText(null)
    } finally { loader.unregister() }
    const hash = createHash("sha256").update(expected.replace(/\r\n/g, "\n").trim(), "utf8").digest("hex")
    assert(org.charterVersions[0].organizationId === QUESTIONS_ORG && org.charterVersions[0].text === expected && org.charterVersions[0].hash === hash, "Unknown convention proof in owned fixture")
  }
  assert.equal(org.events.length, 1)
  const event = org.events[0]
  assert(event.id === QUESTIONS_EVENT && event.title === "Préparer les questions de l'équipe" && event.slug === "atelier-questions" && event.publicStatus === "published" && event.remindersEnabled === false && event.startDate.toISOString() === QUESTIONS_DATE && event.endDate.toISOString() === QUESTIONS_DATE)
  assert([event.pages, event.sectorLeaders, event.milestones, event.targetedMessages].every(rows => rows.length === 0))
  assert.equal(event.shifts.length, 4)
  for (const [i, id] of QUESTIONS_SHIFTS.entries()) {
    const shift = event.shifts.find(s => s.id === id)
    assert(shift && shift.eventId === QUESTIONS_EVENT && shift.roleName === "Accueil" && shift.label === `Accueil — passage ${i + 1}` && shift.startTime === `${10 + i * 2}:00` && shift.endTime === `${12 + i * 2}:00` && shift.date.toISOString() === QUESTIONS_DATE && shift.capacity === 4 && !shift.minAge && shift.reservedTags.length === 0)
    assert(shift.registrations.every(r => r.eventId === QUESTIONS_EVENT && r.volunteerId === QUESTIONS_MEMBER && event.registrations.some(own => own.id === r.id)), "Shift cascade would affect another event/member")
  }
  assert(event.registrations.length <= 3 && new Set(event.registrations.map(r => r.shiftId)).size === event.registrations.length)
  assert(event.registrations.every(r => r.eventId === QUESTIONS_EVENT && r.volunteerId === QUESTIONS_MEMBER && QUESTIONS_SHIFTS.slice(0, 3).includes(r.shiftId) && r.status === "active" && r.source === "public_form"), "Unexpected registrations in owned fixture")
  assert(event.registrations.every(r => org.charterVersions.length === 1 && r.charterAcceptedHash === org.charterVersions[0].hash && r.charterAcceptedAt instanceof Date), "Each actual public registration must retain the current convention acceptance proof")
  assert.equal(event.memberInvites.length, 1)
  assert(event.memberInvites[0].id === `${QUESTIONS_ORG}-invite` && event.memberInvites[0].volunteerId === QUESTIONS_MEMBER)
  assert(event.questions.length <= 4 && new Set(event.questions.map(q => q.label)).size === event.questions.length)
  for (const question of event.questions) {
    const definition = trainingQuestions.find(q => q.label === question.label)
    assert(definition && question.eventId === QUESTIONS_EVENT && question.type === definition.type && question.required === definition.required)
    assert(JSON.stringify(question.options) === JSON.stringify(definition.options) || (question.label === "Taille de t-shirt" && JSON.stringify(question.options) === JSON.stringify([...definition.options, "XXL"])))
    assert(question.archivedAt === null || question.label === "Taille de t-shirt")
    assert(question.answers.every(answer => answer.volunteerId === QUESTIONS_MEMBER && answer.eventId === QUESTIONS_EVENT))
  }
  assert(event.questionAnswers.every(answer => answer.volunteerId === QUESTIONS_MEMBER && answer.eventId === QUESTIONS_EVENT && event.questions.some(q => q.id === answer.questionId)))
  for (const answer of event.questionAnswers) {
    const label = event.questions.find(q => q.id === answer.questionId)!.label
    const allowed = label === "Taille de t-shirt" ? ["M", "L"] : label === "Permis de conduire" ? ["Oui"] : label === "Matériel de transport" ? ["Vélo", "Remorque"] : ["Entrée nord"]
    assert(answer.values.length > 0 && answer.values.every(value => allowed.includes(value)), "Unknown answer data in owned fixture")
  }
  assert(event.logs.every(log => ["question.created", "question.updated", "question.removed", "registration.created"].includes(log.action)), "Unexpected event log actions")
  // Do not cascade any member relation belonging to another organization.
  const cross = await db.volunteer.findUniqueOrThrow({ where: { id: QUESTIONS_MEMBER }, include: { registrations: true, invites: true, questionAnswers: true, pushSubscriptions: true, deliveryOutcomes: true, mergedFrom: true, duplicateDismissalsAsA: true, duplicateDismissalsAsB: true } })
  assert(cross.registrations.every(r => r.eventId === QUESTIONS_EVENT) && cross.invites.every(i => i.eventId === QUESTIONS_EVENT) && cross.questionAnswers.every(a => a.eventId === QUESTIONS_EVENT) && cross.pushSubscriptions.length === 0 && cross.mergedFrom.length === 0 && cross.duplicateDismissalsAsA.length === 0 && cross.duplicateDismissalsAsB.length === 0 && cross.mergedIntoId === null && cross.erasedAt === null)
  assert(cross.deliveryOutcomes.every(o => o.organizationId === QUESTIONS_ORG && o.kind === "registration_confirmation" && o.outcome === "accepted_by_relay"), "Unexpected delivery history")
  return org
}

export async function readQuestionsSnapshot(db: PrismaClient): Promise<QuestionSnapshot> {
  const org = await assertQuestionsReviewFixture(db)
  const event = org.events[0]
  return {
    organizationId: org.id, eventId: event.id, volunteerEmail: QUESTIONS_EMAIL,
    questions: [...event.questions].sort((a, b) => a.position - b.position).map(q => ({ id: q.id, label: q.label, type: q.type, required: q.required, options: q.options, active: q.archivedAt === null })),
    answers: event.questionAnswers.map(a => ({ questionId: a.questionId, value: event.questions.find(q => q.id === a.questionId)?.type === "multiple" ? a.values : a.values[0] })),
    confirmedRegistrationCount: event.registrations.filter(r => r.status === "active").length,
  }
}
