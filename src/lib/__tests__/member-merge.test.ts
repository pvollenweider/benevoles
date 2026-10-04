// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  buildMergePlan,
  buildMergePreview,
  fieldDiffs,
  mergeConflicts,
  refuseMerge,
  resolvedFields,
  UnresolvedConflictsError,
  type MemberMergeInput,
  type VolunteerLite,
} from "../member-merge"

function volunteer(overrides: Partial<VolunteerLite> & { id: string }): VolunteerLite {
  return {
    firstName: "Alice",
    lastName: "Martin",
    email: "alice@example.com",
    phone: null,
    tags: [],
    notes: null,
    birthDate: null,
    availabilityPeriods: [],
    availabilityNote: null,
    active: true,
    createdAt: new Date("2026-01-01"),
    organizationId: "org-1",
    mergedIntoId: null,
    ...overrides,
  }
}

function baseInput(overrides: Partial<MemberMergeInput> = {}): MemberMergeInput {
  return {
    keep: volunteer({ id: "keep-1" }),
    absorb: volunteer({ id: "absorb-1", email: "alice.wrong@example.com" }),
    shifts: [],
    keepRegistrations: [],
    absorbRegistrations: [],
    keepInvites: [],
    absorbInvites: [],
    keepAnswers: [],
    absorbAnswers: [],
    absorbPushSubscriptions: [],
    absorbDeliveryOutcomes: [],
    sectorLeadersMatchingAbsorbed: [],
    keepAddressHash: "hash-keep",
    ...overrides,
  }
}

describe("refuseMerge", () => {
  it("refuses merging a record with itself", () => {
    const keep = volunteer({ id: "a" })
    expect(refuseMerge({ keep, absorb: keep })).toMatch(/elle-même/)
  })

  it("refuses merging across organizations", () => {
    const keep = volunteer({ id: "a", organizationId: "org-1" })
    const absorb = volunteer({ id: "b", organizationId: "org-2" })
    expect(refuseMerge({ keep, absorb })).toBe("Non trouvé")
  })

  it("refuses when either side was already merged", () => {
    const keep = volunteer({ id: "a" })
    const absorb = volunteer({ id: "b", mergedIntoId: "c" })
    expect(refuseMerge({ keep, absorb })).toMatch(/déjà été fusionnée/)
  })

  it("allows an inactive absorbed record", () => {
    const keep = volunteer({ id: "a" })
    const absorb = volunteer({ id: "b", active: false })
    expect(refuseMerge({ keep, absorb })).toBeNull()
  })
})

describe("fieldDiffs / resolvedFields", () => {
  it("reports differing fields and defaults to keeping the kept value", () => {
    const input = baseInput()
    const diffs = fieldDiffs(input, {})
    const email = diffs.find((d) => d.field === "email")!
    expect(email.differs).toBe(true)
    expect(email.chosen).toBe("keep")
    expect(resolvedFields(input, {}).email).toBe("alice@example.com")
  })

  it("applies an explicit choice to take the absorbed value", () => {
    const input = baseInput()
    expect(resolvedFields(input, { fields: { email: "absorb" } }).email).toBe("alice.wrong@example.com")
  })

  it("unions tags and availability periods without a choice", () => {
    const input = baseInput({
      keep: volunteer({ id: "keep-1", tags: ["benevole"], availabilityPeriods: ["morning"] }),
      absorb: volunteer({ id: "absorb-1", tags: ["cuisine"], availabilityPeriods: ["evening"] }),
    })
    const resolved = resolvedFields(input, {})
    expect(resolved.tags.sort()).toEqual(["benevole", "cuisine"])
    expect(resolved.availabilityPeriods.sort()).toEqual(["evening", "morning"])
  })

  it("concatenates notes on request", () => {
    const input = baseInput({
      keep: volunteer({ id: "keep-1", notes: "Allergie noix" }),
      absorb: volunteer({ id: "absorb-1", notes: "Dispo le soir" }),
    })
    expect(resolvedFields(input, { notesMode: "concatenate" }).notes).toBe("Allergie noix\n\nDispo le soir")
  })
})

describe("mergeConflicts — same shift", () => {
  const shift = { id: "s1", eventId: "e1", roleName: "Bar", label: "Bar samedi", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", minAge: null, maxPerVolunteer: null, reservedTags: [] }

  it("flags both records live on the same shift, resolved by rank when not tied", () => {
    const input = baseInput({
      shifts: [shift],
      keepRegistrations: [{ id: "r-keep", eventId: "e1", shiftId: "s1", status: "waiting", checkedInAt: null }],
      absorbRegistrations: [{ id: "r-absorb", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
    })
    const conflicts = mergeConflicts(input, {})
    const c = conflicts.find((c) => c.kind === "same_shift")
    expect(c).toMatchObject({ kind: "same_shift", shiftId: "s1", resolvedBy: "rank" })
  })

  it("the plan cancels the losing registration and reassigns the other", () => {
    const input = baseInput({
      shifts: [shift],
      keepRegistrations: [{ id: "r-keep", eventId: "e1", shiftId: "s1", status: "waiting", checkedInAt: null }],
      absorbRegistrations: [{ id: "r-absorb", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
    })
    const plan = buildMergePlan(input, {})
    expect(plan.registrationsToCancel).toEqual([{ id: "r-keep", shiftLabel: "Bar samedi" }])
    expect(plan.registrationsToReassign).toEqual(["r-absorb"])
  })

  it("attendance (checkedInAt) wins over status rank", () => {
    const input = baseInput({
      shifts: [shift],
      keepRegistrations: [{ id: "r-keep", eventId: "e1", shiftId: "s1", status: "waiting", checkedInAt: new Date() }],
      absorbRegistrations: [{ id: "r-absorb", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
    })
    const plan = buildMergePlan(input, {})
    expect(plan.registrationsToCancel.map((r) => r.id)).toEqual(["r-absorb"])
  })

  it("respects an explicit choice over the rank default", () => {
    const input = baseInput({
      shifts: [shift],
      keepRegistrations: [{ id: "r-keep", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
      absorbRegistrations: [{ id: "r-absorb", eventId: "e1", shiftId: "s1", status: "waiting", checkedInAt: null }],
    })
    const plan = buildMergePlan(input, { registrationConflicts: { s1: "absorb" } })
    expect(plan.registrationsToCancel.map((r) => r.id)).toEqual(["r-keep"])
  })
})

describe("mergeConflicts — overlap, role limit, min age, reserved role", () => {
  it("reports an overlap between a kept and an absorbed shift, non-blocking", () => {
    const shiftA = { id: "sa", eventId: "e1", roleName: "Bar", label: "A", date: new Date("2030-06-01"), startTime: "10:00", endTime: "14:00", minAge: null, maxPerVolunteer: null, reservedTags: [] }
    const shiftB = { id: "sb", eventId: "e1", roleName: "Accueil", label: "B", date: new Date("2030-06-01"), startTime: "12:00", endTime: "16:00", minAge: null, maxPerVolunteer: null, reservedTags: [] }
    const input = baseInput({
      shifts: [shiftA, shiftB],
      keepRegistrations: [{ id: "r1", eventId: "e1", shiftId: "sa", status: "active", checkedInAt: null }],
      absorbRegistrations: [{ id: "r2", eventId: "e1", shiftId: "sb", status: "active", checkedInAt: null }],
    })
    const conflicts = mergeConflicts(input, {})
    expect(conflicts).toContainEqual({ kind: "overlap", shiftIds: ["sa", "sb"], labels: ["A", "B"] })
    expect(buildMergePlan(input, {})).toBeTruthy() // non-blocking: plan still builds
  })

  it("reports a role limit exceeded across the merged registrations", () => {
    const shifts = [
      { id: "s1", eventId: "e1", roleName: "Bar", label: "Bar 1", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", minAge: null, maxPerVolunteer: 1, reservedTags: [] },
      { id: "s2", eventId: "e1", roleName: "Bar", label: "Bar 2", date: new Date("2030-06-02"), startTime: "10:00", endTime: "12:00", minAge: null, maxPerVolunteer: 1, reservedTags: [] },
    ]
    const input = baseInput({
      shifts,
      keepRegistrations: [{ id: "r1", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
      absorbRegistrations: [{ id: "r2", eventId: "e1", shiftId: "s2", status: "active", checkedInAt: null }],
    })
    expect(mergeConflicts(input, {})).toContainEqual({ kind: "role_limit", roleName: "Bar", limit: 1, count: 2 })
  })

  it("reports a minimum age conflict against the resolved birth date", () => {
    const shift = { id: "s1", eventId: "e1", roleName: "Bar", label: "Bar", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", minAge: 18, maxPerVolunteer: null, reservedTags: [] }
    const input = baseInput({
      shifts: [shift],
      keep: volunteer({ id: "keep-1", birthDate: new Date("2015-01-01") }),
      absorbRegistrations: [{ id: "r2", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
    })
    expect(mergeConflicts(input, {})).toContainEqual(expect.objectContaining({ kind: "min_age", shiftId: "s1" }))
  })

  it("reports a reserved-role conflict when the merged tags don't match", () => {
    const shift = { id: "s1", eventId: "e1", roleName: "Securite", label: "Sécurité", date: new Date("2030-06-01"), startTime: "10:00", endTime: "12:00", minAge: null, maxPerVolunteer: null, reservedTags: ["certifie"] }
    const input = baseInput({
      shifts: [shift],
      absorbRegistrations: [{ id: "r2", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
    })
    expect(mergeConflicts(input, {})).toContainEqual(expect.objectContaining({ kind: "reserved_role", shiftId: "s1" }))
  })
})

describe("mergeConflicts — answers and invites", () => {
  it("blocks on an incompatible answer until the organizer picks one", () => {
    const input = baseInput({
      keepAnswers: [{ id: "a-keep", questionId: "q1", eventId: "e1", values: ["oui"] }],
      absorbAnswers: [{ id: "a-absorb", questionId: "q1", eventId: "e1", values: ["non"] }],
    })
    expect(() => buildMergePlan(input, {})).toThrow(UnresolvedConflictsError)
    const plan = buildMergePlan(input, { answerConflicts: { q1: "absorb" } })
    expect(plan.answerIdsToDrop).toEqual(["a-keep"])
    expect(plan.answerIdsToReassign).toEqual(["a-absorb"])
  })

  it("does not conflict when both answered the same thing", () => {
    const input = baseInput({
      keepAnswers: [{ id: "a-keep", questionId: "q1", eventId: "e1", values: ["oui"] }],
      absorbAnswers: [{ id: "a-absorb", questionId: "q1", eventId: "e1", values: ["oui"] }],
    })
    expect(mergeConflicts(input, {}).some((c) => c.kind === "same_question")).toBe(false)
  })

  it("resolves a same-event invite automatically when only one was used", () => {
    const input = baseInput({
      keepInvites: [{ id: "i-keep", eventId: "e1", usedAt: null }],
      absorbInvites: [{ id: "i-absorb", eventId: "e1", usedAt: new Date() }],
    })
    expect(mergeConflicts(input, {}).find((c) => c.kind === "same_event_invite")).toMatchObject({ blocking: false, resolvedBy: "used_first" })
    const plan = buildMergePlan(input, {})
    expect(plan.inviteIdsToReassign).toEqual(["i-absorb"])
    expect(plan.inviteIdsToDelete).toEqual(["i-keep"])
  })

  it("blocks a same-event invite when neither or both were used, until chosen", () => {
    const input = baseInput({
      keepInvites: [{ id: "i-keep", eventId: "e1", usedAt: null }],
      absorbInvites: [{ id: "i-absorb", eventId: "e1", usedAt: null }],
    })
    expect(() => buildMergePlan(input, {})).toThrow(UnresolvedConflictsError)
    const plan = buildMergePlan(input, { inviteConflicts: { e1: "absorb" } })
    expect(plan.inviteIdsToReassign).toEqual(["i-absorb"])
  })
})

describe("buildMergePreview", () => {
  it("counts registrations by status, dropped push subscriptions and delivery outcomes by address hash", () => {
    const input = baseInput({
      absorbRegistrations: [
        { id: "r1", eventId: "e1", shiftId: "s1", status: "cancelled", checkedInAt: null },
        { id: "r2", eventId: "e1", shiftId: "s2", status: "active", checkedInAt: null },
      ],
      absorbPushSubscriptions: [{ id: "p1", endpoint: "https://x" }],
      absorbDeliveryOutcomes: [
        { id: "d1", addressHash: "hash-keep" },
        { id: "d2", addressHash: "hash-other" },
      ],
    })
    const preview = buildMergePreview(input, {})
    expect(preview.counts.registrationsByStatus).toEqual({ cancelled: 1, active: 1 })
    expect(preview.counts.pushSubscriptionsDropped).toBe(1)
    expect(preview.counts.deliveryOutcomesReassigned).toBe(1)
    expect(preview.counts.deliveryOutcomesLeft).toBe(1)
  })
})

describe("buildMergePlan — delivery outcomes and push subscriptions", () => {
  it("only reassigns delivery outcomes matching the kept address hash, drops push subscriptions", () => {
    const input = baseInput({
      absorbPushSubscriptions: [{ id: "p1", endpoint: "https://x" }],
      absorbDeliveryOutcomes: [
        { id: "d1", addressHash: "hash-keep" },
        { id: "d2", addressHash: "hash-other" },
        { id: "d3", addressHash: null },
      ],
    })
    const plan = buildMergePlan(input, {})
    expect(plan.deliveryOutcomeIdsToReassign).toEqual(["d1"])
    expect(plan.pushSubscriptionIdsToDelete).toEqual(["p1"])
  })

  it("lists every moved registration and invite for token regeneration", () => {
    const input = baseInput({
      absorbRegistrations: [{ id: "r1", eventId: "e1", shiftId: "s1", status: "active", checkedInAt: null }],
      absorbInvites: [{ id: "i1", eventId: "e2", usedAt: null }],
    })
    const plan = buildMergePlan(input, {})
    expect(plan.tokenRegeneration).toEqual({ registrationIds: ["r1"], inviteIds: ["i1"] })
  })
})
