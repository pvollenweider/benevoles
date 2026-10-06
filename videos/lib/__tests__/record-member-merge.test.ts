// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { test } from "vitest"
import assert from "node:assert/strict"
import { validateMemberMergeBefore, validateMemberMergeAfter, validateMergeLink, type MemberMergeBefore, type MemberMergeAfter } from "../record-member-merge"

const base = "http://localhost:43102"
function beforeFixture(): MemberMergeBefore {
  const keep = { id: "video-member-merge-a", organizationId: "video-member-merge", firstName: "Robin", lastName: "Exemple", email: "robin@example.org", phone: null, active: true, mergedIntoId: null, tags: ["accueil"], notes: "Disponible le matin.", availabilityNote: null, availabilityPeriods: ["matin"], birthDate: null }
  const absorb = { ...keep, id: "video-member-merge-b", email: "robim@example.org", tags: ["buvette"], notes: "Connaît le lieu.", availabilityPeriods: ["après-midi"] }
  return {
    databaseUrl: "postgresql://fixture:fixture@localhost:45433/benevoles_video", organizationId: "video-member-merge", sessionRole: "owner",
    keep, absorb, organizationMembers: [keep, absorb], questionConflictIds: ["video-question"], invitationConflictEventIds: ["video-event"],
    movedRegistrationIds: ["video-registration"], movedInvitationIds: ["video-invitation"],
    oldMovedLinks: [
      { kind: "registration", entityId: "video-registration", apiUrl: `${base}/api/public/registrations/demo-member-merge-old-reg` },
      { kind: "invitation", entityId: "video-invitation", apiUrl: `${base}/api/public/member-invite/demo-member-merge-old-invite` },
    ],
  }
}
function afterFixture(before: MemberMergeBefore): MemberMergeAfter {
  return {
    keep: { ...before.keep, notes: `${before.keep.notes}\n${before.absorb.notes}`, tags: [...before.keep.tags, ...before.absorb.tags], availabilityPeriods: [...before.keep.availabilityPeriods, ...before.absorb.availabilityPeriods] },
    absorb: { ...before.absorb, firstName: "", lastName: "", email: null, phone: null, active: false, mergedIntoId: before.keep.id, tags: [], notes: null, availabilityNote: null, availabilityPeriods: [], birthDate: null },
    registrationOwners: [{ id: "video-registration", volunteerId: before.keep.id }], invitationOwners: [{ id: "video-invitation", volunteerId: before.keep.id }],
    newMovedLinks: before.oldMovedLinks.map(link => ({ ...link, apiUrl: link.apiUrl.replace("old-", "new-") })),
  }
}
test("strict before guard accepts only dedicated live synthetic members and complete real-link coverage", () => {
  validateMemberMergeBefore(beforeFixture(), base)
  const realEmail = beforeFixture(); realEmail.organizationMembers[1].email = "person@gmail.com"
  assert.throws(() => validateMemberMergeBefore(realEmail, base), /non-synthetic/)
  const wrongDatabase = beforeFixture(); wrongDatabase.databaseUrl = "postgresql://x:y@localhost:5432/production"
  assert.throws(() => validateMemberMergeBefore(wrongDatabase, base), /isolated/)
  const incomplete = beforeFixture(); incomplete.oldMovedLinks.pop()
  assert.throws(() => validateMemberMergeBefore(incomplete, base), /all actual moved/)
  const noConflict = beforeFixture(); noConflict.questionConflictIds = []
  assert.throws(() => validateMemberMergeBefore(noConflict, base), /both blocking/)
})
test("personal proof rejects remote hosts and mutation paths", () => {
  const link = beforeFixture().oldMovedLinks[0]
  assert.throws(() => validateMergeLink({ ...link, apiUrl: "https://benevol.app/api/public/registrations/demo-member-merge-old-reg" }, base), /local server/)
  assert.throws(() => validateMergeLink({ ...link, apiUrl: `${link.apiUrl}/resend-link` }, base), /read-only/)
  assert.throws(() => validateMergeLink({ ...link, apiUrl: `${link.apiUrl}?token=private` }, base), /invalid personal/)
})
test("after proof requires moved owners, erased tombstone, notes union and newly generated tokens", () => {
  const before = beforeFixture()
  const after = afterFixture(before)
  const result = validateMemberMergeAfter(before, after, base)
  assert.equal(result.length, 2)
  assert.ok(result.every(proof => proof.oldLinkSha256 !== proof.newLinkSha256))
  assert.ok(result.every(proof => !JSON.stringify(proof).includes("demo-member-merge")))
  const unrotated = afterFixture(before); unrotated.newMovedLinks[0] = before.oldMovedLinks[0]
  assert.throws(() => validateMemberMergeAfter(before, unrotated, base), /not regenerated/)
  const uncleared = afterFixture(before); uncleared.absorb.email = before.absorb.email
  assert.throws(() => validateMemberMergeAfter(before, uncleared, base), /not cleared/)
  const notMoved = afterFixture(before); notMoved.registrationOwners[0].volunteerId = before.absorb.id
  assert.throws(() => validateMemberMergeAfter(before, notMoved, base), /not owned/)
  const lostTags = afterFixture(before); lostTags.keep.tags = []
  assert.throws(() => validateMemberMergeAfter(before, lostTags, base), /tags/)
})
