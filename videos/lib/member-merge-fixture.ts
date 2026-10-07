// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import type { PrismaClient } from "../../src/generated/prisma/client"
import { registrationToken, linkToken } from "../../src/lib/token-vault"
import type { MemberMergeBefore, MemberMergeAfter } from "./record-member-merge"
import { privateIdentities, readPrivateIdentityVersion } from "./private-identity-version"

export const MERGE_ORG = "video-member-merge"
export const MERGE_SLUG = "formation-fusion"
export const MERGE_OWNER = "video.merge.owner@example.org"
export const MERGE_KEEP = `${MERGE_ORG}-a`
export const MERGE_ABSORB = `${MERGE_ORG}-b`
export const MERGE_EVENT = `${MERGE_ORG}-event`
export const MERGE_MOVED_REGISTRATION = `${MERGE_ORG}-registration-moved`
export const MERGE_MOVED_INVITE = `${MERGE_ORG}-invite-absorb`
export const MERGE_QUESTION = `${MERGE_ORG}-question`

export function mergeFixturePhone(phone: string | null): string | null {
  if (phone === null || !/^[+\d\s().-]+$/.test(phone)) return null
  let digits = phone.replace(/\D/g, "")
  if (digits.startsWith("0041")) digits = `0${digits.slice(4)}`
  else if (digits.startsWith("41")) digits = `0${digits.slice(2)}`
  return /^079000010[01]$/.test(digits) ? digits : null
}

export function assertMergeDatabase(databaseUrl: string) {
  const database = new URL(databaseUrl)
  assert(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && database.port === "45433" && database.pathname === "/benevoles_video", "Merge fixture requires isolated local video DB")
}

/** Also accepts the actual post-merge tombstone, but never arbitrary null-email members. */
export async function assertMergeReviewFixture(db: PrismaClient, databaseUrl: string) {
  assertMergeDatabase(databaseUrl)
  const identityV2 = await readPrivateIdentityVersion("merge")
  const org = await db.organization.findUniqueOrThrow({ where: { id: MERGE_ORG }, include: { admins: true, volunteers: true, events: { include: { shifts: true, registrations: true, memberInvites: true, questions: { include: { answers: true } }, sectorLeaders: true } } } })
  assert.equal(org.slug, MERGE_SLUG)
  assert.equal(org.name, "Formation — doublons et fusion")
  if (identityV2) assert.equal(org.createdAt.toISOString(), identityV2.organizationCreatedAt, "Identity migration belongs to a different merge fixture generation")
  assert.equal(org.admins.length, 1)
  assert(org.admins[0].id === `${MERGE_ORG}-owner` && org.admins[0].name === (identityV2 ? privateIdentities.merge.owner : "Élodie Exemple") && org.admins[0].email === MERGE_OWNER && org.admins[0].role === "admin" && org.admins[0].isActive)
  assert.equal(org.volunteers.length, 2)
  const keep = org.volunteers.find(member => member.id === MERGE_KEEP)
  const absorb = org.volunteers.find(member => member.id === MERGE_ABSORB)
  assert(keep && absorb && keep.active && keep.email === "video.merge.robin@example.org" && keep.firstName === "Robin" && keep.lastName === (identityV2 ? privateIdentities.merge.members.a : "Exemple"))
  assert(mergeFixturePhone(keep.phone) && keep.tags.every(tag => ["accueil", "buvette"].includes(tag)) && keep.availabilityPeriods.every(period => ["morning", "afternoon"].includes(period)))
  if (absorb.mergedIntoId === MERGE_KEEP) {
    assert(!absorb.active && absorb.email === null && absorb.phone === null && absorb.firstName === "" && absorb.lastName === "" && absorb.notes === null && absorb.birthDate === null && absorb.tags.length === 0 && absorb.availabilityPeriods.length === 0 && absorb.availabilityNote === null)
  } else assert(absorb.active && absorb.mergedIntoId === null && absorb.email === "video.merge.robim@example.org" && absorb.firstName === "Robin" && absorb.lastName === (identityV2 ? privateIdentities.merge.members.b : "Exemple") && mergeFixturePhone(absorb.phone) === "0790000101")
  assert.equal(org.events.length, 1)
  const event = org.events[0]
  assert(event.id === MERGE_EVENT && event.slug === "atelier-fusion" && event.title === "Fusion de fiches — démonstration" && event.sectorLeaders.length === 0 && event.remindersEnabled === false)
  assert(event.shifts.length === 2 && event.shifts.every(shift => shift.id === `${MERGE_ORG}-shift-main` || shift.id === `${MERGE_ORG}-shift-overlap`))
  assert(event.registrations.length === 3 && event.registrations.every(registration => /^video-member-merge-registration-(keep|same|moved)$/.test(registration.id) && [MERGE_KEEP, MERGE_ABSORB].includes(registration.volunteerId)))
  assert(event.memberInvites.length >= 1 && event.memberInvites.length <= 2 && event.memberInvites.every(invite => [MERGE_MOVED_INVITE, `${MERGE_ORG}-invite-keep`].includes(invite.id) && [MERGE_KEEP, MERGE_ABSORB].includes(invite.volunteerId)))
  assert(event.questions.length === 1 && event.questions[0].id === MERGE_QUESTION && event.questions[0].answers.every(answer => [MERGE_KEEP, MERGE_ABSORB].includes(answer.volunteerId)))
  return org
}

const memberSnapshot = (member: Awaited<ReturnType<typeof assertMergeReviewFixture>>["volunteers"][number]): MemberMergeBefore["keep"] => ({
  id: member.id, organizationId: member.organizationId!, firstName: member.firstName, lastName: member.lastName,
  email: member.email, phone: member.phone, active: member.active, mergedIntoId: member.mergedIntoId,
  tags: member.tags, notes: member.notes, birthDate: member.birthDate?.toISOString() ?? null,
  availabilityNote: member.availabilityNote, availabilityPeriods: member.availabilityPeriods,
})

/** Returns read-only database callbacks; capture itself performs the real UI mutation. */
export function memberMergeReaders(db: PrismaClient, databaseUrl: string, baseUrl: string) {
  return {
    readBefore: async (): Promise<MemberMergeBefore> => {
      const org = await assertMergeReviewFixture(db, databaseUrl)
      const keep = memberSnapshot(org.volunteers.find(member => member.id === MERGE_KEEP)!)
      const absorb = memberSnapshot(org.volunteers.find(member => member.id === MERGE_ABSORB)!)
      assert(absorb.active && absorb.mergedIntoId === null, "Merge already happened: never replay an irreversible take on changed data")
      const event = org.events[0]
      const registration = event.registrations.find(row => row.id === MERGE_MOVED_REGISTRATION)!
      const invite = event.memberInvites.find(row => row.id === MERGE_MOVED_INVITE)!
      assert(registration.volunteerId === MERGE_ABSORB && invite.volunteerId === MERGE_ABSORB)
      return {
        databaseUrl, organizationId: MERGE_ORG, sessionRole: "owner", keep, absorb, organizationMembers: org.volunteers.map(memberSnapshot),
        questionConflictIds: [MERGE_QUESTION], invitationConflictEventIds: [MERGE_EVENT], movedRegistrationIds: [MERGE_MOVED_REGISTRATION, `${MERGE_ORG}-registration-same`], movedInvitationIds: [MERGE_MOVED_INVITE],
        oldMovedLinks: [
          { kind: "registration", entityId: registration.id, apiUrl: `${baseUrl}/api/public/registrations/${registrationToken.reveal(registration)}` },
          { kind: "registration", entityId: `${MERGE_ORG}-registration-same`, expectedAfterStatus: 404, apiUrl: `${baseUrl}/api/public/registrations/${registrationToken.reveal(event.registrations.find(row => row.id === `${MERGE_ORG}-registration-same`)!)}` },
          { kind: "invitation", entityId: invite.id, apiUrl: `${baseUrl}/api/public/member-invite/${linkToken.reveal(invite)}` },
        ],
      }
    },
    readAfter: async (): Promise<MemberMergeAfter> => {
      const org = await assertMergeReviewFixture(db, databaseUrl)
      const event = org.events[0]
      const registration = event.registrations.find(row => row.id === MERGE_MOVED_REGISTRATION)!
      const invite = event.memberInvites.find(row => row.id === MERGE_MOVED_INVITE)!
      assert(registration && invite, "Actual moved rows are missing after the merge")
      assert.equal(event.registrations.find(row => row.id === `${MERGE_ORG}-registration-same`)!.status, "cancelled", "The duplicate same-slot waitlist registration must actually be cancelled")
      assert(event.questions[0].answers.length === 1 && event.questions[0].answers[0].volunteerId === MERGE_KEEP && event.questions[0].answers[0].values.join(",") === "L", "Selected absorbed answer was not kept")
      assert.equal(await db.pushSubscription.count({ where: { volunteerId: MERGE_ABSORB } }), 0, "Browser subscription was not dropped")
      return {
        keep: memberSnapshot(org.volunteers.find(member => member.id === MERGE_KEEP)!), absorb: memberSnapshot(org.volunteers.find(member => member.id === MERGE_ABSORB)!),
        registrationOwners: event.registrations.map(row => ({ id: row.id, volunteerId: row.volunteerId })), invitationOwners: event.memberInvites.map(row => ({ id: row.id, volunteerId: row.volunteerId })),
        cancelledRegistrationIds: event.registrations.filter(row => row.status === "cancelled").map(row => row.id),
        newMovedLinks: [
          { kind: "registration", entityId: registration.id, apiUrl: `${baseUrl}/api/public/registrations/${registrationToken.reveal(registration)}` },
          { kind: "registration", entityId: `${MERGE_ORG}-registration-same`, expectedAfterStatus: 404, apiUrl: `${baseUrl}/api/public/registrations/${registrationToken.reveal(event.registrations.find(row => row.id === `${MERGE_ORG}-registration-same`)!)}` },
          { kind: "invitation", entityId: invite.id, apiUrl: `${baseUrl}/api/public/member-invite/${linkToken.reveal(invite)}` },
        ],
      }
    },
  }
}
