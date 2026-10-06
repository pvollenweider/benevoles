// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { MERGE_ORG, MERGE_KEEP, MERGE_ABSORB, MERGE_EVENT, MERGE_MOVED_INVITE, MERGE_QUESTION, assertMergeReviewFixture, mergeFixturePhone } from "./member-merge-fixture"

export const mergeOwnedSchema = {
  organizationId: MERGE_ORG, name: "Formation — doublons et fusion", slug: "formation-fusion",
  adminIds: [`${MERGE_ORG}-owner`], memberIds: [MERGE_KEEP, MERGE_ABSORB], eventIds: [MERGE_EVENT],
  shiftIds: [`${MERGE_ORG}-shift-main`, `${MERGE_ORG}-shift-overlap`],
  registrationIds: [`${MERGE_ORG}-registration-keep`, `${MERGE_ORG}-registration-same`, `${MERGE_ORG}-registration-moved`],
  invitationIds: [`${MERGE_ORG}-invite-keep`, MERGE_MOVED_INVITE], questionIds: [MERGE_QUESTION],
  answerIds: [`${MERGE_ORG}-answer-keep`, `${MERGE_ORG}-answer-absorb`], pushIds: [`${MERGE_ORG}-push`],
  version: 1,
} as const
export const mergeOwnedSchemaSha256 = createHash("sha256").update(JSON.stringify(mergeOwnedSchema)).digest("hex")
export type MergeOwnershipLedger = {
  schemaVersion: 1; scenario: "members-duplicates-merge"; organizationId: typeof MERGE_ORG
  organizationCreatedAt: string; preparedAt: string; fixtureSchemaSha256: string
  owned: typeof mergeOwnedSchema
}
export function validateMergeOwnershipLedger(ledger: MergeOwnershipLedger, createdAt: string) {
  assert(ledger.schemaVersion === 1 && ledger.scenario === "members-duplicates-merge" && ledger.organizationId === MERGE_ORG)
  assert.equal(ledger.fixtureSchemaSha256, mergeOwnedSchemaSha256, "Owned schema ledger hash mismatch")
  assert.deepEqual(ledger.owned, mergeOwnedSchema, "Owned fixture IDs differ from the exact reset schema")
  assert.equal(ledger.organizationCreatedAt, createdAt, "Ledger belongs to a different fixture generation")
}

/** Call inside the reset transaction. No prefix deletion and no unrelated rows are tolerated. */
export async function assertMergeResetFixture(db: PrismaClient, databaseUrl: string, ledger: MergeOwnershipLedger | null) {
  const org = await assertMergeReviewFixture(db, databaseUrl)
  if (ledger) validateMergeOwnershipLedger(ledger, org.createdAt.toISOString())
  const keep = org.volunteers.find(member => member.id === MERGE_KEEP)!
  const absorb = org.volunteers.find(member => member.id === MERGE_ABSORB)!
  const merged = absorb.mergedIntoId === MERGE_KEEP
  // Recovery of a first preparation that committed but failed its post-check has no ledger.
  // It is accepted ONLY in the complete, exact initial state. A merged state needs its ledger.
  assert(ledger || !merged, "Post-merge reset requires its preparation ownership ledger")
  const event = org.events[0]
  assert.equal(org.timeZone, "Europe/Zurich")
  assert.equal(org.replyToEmail, "video.merge.owner@example.org")
  assert.equal(event.startDate.toISOString(), "2026-11-28T00:00:00.000Z")
  assert.equal(event.endDate.toISOString(), "2026-11-28T00:00:00.000Z")
  assert.equal(event.publicStatus, "published")
  assert.equal(event.isListed, false)
  assert.equal(event.description, "Données fictives de formation uniquement.")
  for (const shift of event.shifts) {
    assert.equal(shift.roleName, "Accueil")
    assert.equal(shift.capacity, 5)
    assert.equal(shift.maxPerVolunteer, 1)
    assert.equal(shift.date.toISOString(), "2026-11-28T00:00:00.000Z")
    assert.equal(shift.status, "open")
    if (shift.id === `${MERGE_ORG}-shift-main`) {
      assert(shift.label === "Accueil entrée principale" && shift.startTime === "10:00" && shift.endTime === "12:00" && shift.minAge === null && shift.reservedTags.length === 0)
    } else assert(shift.label === "Relève entrée nord" && shift.startTime === "11:00" && shift.endTime === "13:00" && shift.minAge === 60 && shift.reservedTags.join(",") === "permis-b")
  }
  assert.equal(event.questions[0].label, "Taille du t-shirt")
  assert.deepEqual(event.questions[0].options, ["M", "L"])
  assert.equal(event.questions[0].type, "single")
  const members = [MERGE_KEEP, MERGE_ABSORB]
  // These global checks catch relations outside this organization before cascades can touch them.
  assert.equal(await db.registration.count({ where: { volunteerId: { in: members } } }), 3)
  assert.equal(await db.memberInvite.count({ where: { volunteerId: { in: members } } }), merged ? 1 : 2)
  assert.equal(await db.questionAnswer.count({ where: { volunteerId: { in: members } } }), merged ? 1 : 2)
  const pushes = await db.pushSubscription.findMany({ where: { volunteerId: { in: members } } })
  assert.equal(pushes.length, merged ? 0 : 1)
  if (!merged) assert(pushes[0].id === `${MERGE_ORG}-push` && pushes[0].volunteerId === MERGE_ABSORB && pushes[0].endpoint === "https://video.invalid/push/merge-fictional-only" && pushes[0].auth === "synthetic-only" && pushes[0].p256dh === "synthetic-only")
  const dismissals = await db.duplicateDismissal.findMany({ where: { OR: [{ organizationId: MERGE_ORG }, { volunteerIdA: { in: members } }, { volunteerIdB: { in: members } }] } })
  assert(dismissals.length <= 1 && dismissals.every(row => row.organizationId === MERGE_ORG && row.volunteerIdA === MERGE_KEEP && row.volunteerIdB === MERGE_ABSORB && row.dismissedBy === `${MERGE_ORG}-owner`))
  assert(dismissals.every(row => ["name", "email+name"].includes(row.signalsFingerprint)), "Unexpected fictional-pair signals refuse reset")
  const logs = await db.orgLog.findMany({ where: { organizationId: MERGE_ORG } })
  // Ignorer is an actual documented first step and writes its own OrgLog.
  // Accept only this precise pair, actor and action, never unrelated activity.
  const ignoredLogs = logs.filter(log => log.action === "member.duplicate_dismissed")
  assert.equal(ignoredLogs.length, dismissals.length)
  for (const log of ignoredLogs) {
    const changes = log.changes as { otherId?: { from?: unknown; to?: unknown }; signals?: { from?: unknown; to?: unknown } } | null
    assert(log.entityType === "Member" && log.entityId === MERGE_KEEP && log.actorType === "admin" && log.actorId === `${MERGE_ORG}-owner` && changes?.otherId?.from === null && changes.otherId.to === MERGE_ABSORB && changes.signals?.from === null && typeof changes.signals.to === "string", "Only the owned pair dismissal audit is accepted")
    assert.equal(changes.signals.to.split("+").sort().join("+"), dismissals[0].signalsFingerprint)
  }
  const mergeLogs = logs.filter(log => log.action !== "member.duplicate_dismissed")
  const eventLogs = await db.eventLog.findMany({ where: { eventId: MERGE_EVENT } })
  if (merged) {
    assert.equal(mergeLogs.length, 1)
    const log = mergeLogs[0]
    const changes = log.changes as { absorbedId?: { from?: string; to?: unknown } } | null
    assert(log.action === "member.merged" && log.entityType === "Member" && log.entityId === MERGE_KEEP && log.actorType === "admin" && log.actorId === `${MERGE_ORG}-owner` && changes?.absorbedId?.from === MERGE_ABSORB && changes.absorbedId.to === null, "Exact committed member.merged audit proof required")
    assert.equal(eventLogs.length, 1)
    assert(eventLogs[0].action === "registration.cancelled" && eventLogs[0].entityId === `${MERGE_ORG}-registration-same` && eventLogs[0].actorId === `${MERGE_ORG}-owner`)
    assert.equal(event.memberInvites[0].id, MERGE_MOVED_INVITE)
    assert(event.registrations.every(row => row.volunteerId === MERGE_KEEP))
    assert.equal(event.registrations.find(row => row.id === `${MERGE_ORG}-registration-same`)!.status, "cancelled")
    assert(event.questions[0].answers.length === 1 && event.questions[0].answers[0].id === `${MERGE_ORG}-answer-absorb` && event.questions[0].answers[0].values.join(",") === "L")
    assert.equal(mergeFixturePhone(keep.phone), "0790000101")
    assert(keep.notes?.includes("Disponible le matin.") && keep.notes.includes("Connaît l'entrée nord."))
    assert.deepEqual([...keep.tags].sort(), ["accueil", "buvette"])
    assert.deepEqual([...keep.availabilityPeriods].sort(), ["afternoon", "morning"])
  } else {
    assert.equal(mergeLogs.length, 0)
    assert.equal(eventLogs.length, 0)
    assert(keep.notes === "Disponible le matin." && keep.birthDate?.toISOString() === "1990-01-15T00:00:00.000Z" && keep.availabilityNote === "Disponible le samedi." && mergeFixturePhone(keep.phone) === "0790000100")
    assert(absorb.notes === "Connaît l'entrée nord." && absorb.birthDate?.toISOString() === "1991-01-15T00:00:00.000Z" && absorb.availabilityNote === "Préférence pour l'accueil.")
    assert.deepEqual(keep.tags, ["accueil"]); assert.deepEqual(absorb.tags, ["buvette"])
    assert.deepEqual(keep.availabilityPeriods, ["morning"]); assert.deepEqual(absorb.availabilityPeriods, ["afternoon"])
    assert(event.memberInvites.length === 2 && event.memberInvites.every(row => row.usedAt === null && row.declinedAt === null))
    assert(event.questions[0].answers.length === 2 && event.questions[0].answers.every(row => row.id === `${MERGE_ORG}-answer-keep` ? row.volunteerId === MERGE_KEEP && row.values.join(",") === "M" : row.id === `${MERGE_ORG}-answer-absorb` && row.volunteerId === MERGE_ABSORB && row.values.join(",") === "L"))
    assert(event.registrations.every(row => row.id === `${MERGE_ORG}-registration-keep` ? row.volunteerId === MERGE_KEEP && row.status === "active" : row.volunteerId === MERGE_ABSORB && row.status === (row.id === `${MERGE_ORG}-registration-same` ? "waiting" : "active")))
  }
  // No unowned communications, exports, pages, branded uploads or other cascading children.
  for (const [model, where] of [
    [db.notificationOutbox, { organizationId: MERGE_ORG }], [db.deliveryOutcome, { organizationId: MERGE_ORG }],
    [db.targetedMessage, { organizationId: MERGE_ORG }], [db.messageTemplate, { organizationId: MERGE_ORG }],
    [db.charterVersion, { organizationId: MERGE_ORG }], [db.erasureRecord, { organizationId: MERGE_ORG }],
    [db.orgSlugHistory, { organizationId: MERGE_ORG }], [db.organizationLogo, { organizationId: MERGE_ORG }],
    [db.eventPage, { eventId: MERGE_EVENT }], [db.eventMilestone, { eventId: MERGE_EVENT }],
  ] as const) assert.equal(await (model.count as unknown as (args: { where: unknown }) => Promise<number>)({ where }), 0, "Reset refuses unexpected fixture children")
  return { createdAt: org.createdAt.toISOString(), passwordHash: org.admins[0].passwordHash, state: merged ? "merged" : "initial" }
}
