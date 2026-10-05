// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  buildErasurePlan,
  ERASED_DISPLAY_NAME,
  ERASED_REGISTRATION_DATA,
  eraseMemberRecap,
  erasedVolunteerData,
  memberErasureEligibility,
  MemberErasureRefusedError,
  outboxPayloadConcernsMember,
  tombstoneChain,
  type ErasureInput,
} from "../member-erasure"

const member = { id: "vol-1", firstName: "Julie", lastName: "Martin", email: "Julie.Martin@example.com", mergedIntoId: null, erasedAt: null }

function input(over: Partial<ErasureInput> = {}): ErasureInput {
  return {
    member,
    registrations: [
      { id: "reg-past", status: "active", upcoming: false },
      { id: "reg-future", status: "active", upcoming: true },
      { id: "reg-wait", status: "waiting", upcoming: true },
      { id: "reg-cancelled", status: "cancelled", upcoming: true },
    ],
    inviteIds: ["inv-1", "inv-declined"],
    answerIds: ["ans-1"],
    pushSubscriptionIds: ["push-1"],
    sectorLeaderIds: ["lead-1"],
    duplicateDismissalIds: ["dis-1"],
    tombstoneIds: ["tomb-1"],
    ...over,
  }
}

describe("memberErasureEligibility (#516)", () => {
  it("any record can be erased, active or not, with or without history", () => {
    expect(memberErasureEligibility({ mergedIntoId: null, erasedAt: null })).toEqual({ eligible: true })
  })

  it("never twice: an erased record is refused and flagged as already erased (idempotent route)", () => {
    const r = memberErasureEligibility({ mergedIntoId: null, erasedAt: new Date() })
    expect(r).toMatchObject({ eligible: false, alreadyErased: true })
  })

  it("never a merge tombstone: erase the kept record instead", () => {
    const r = memberErasureEligibility({ mergedIntoId: "vol-2", erasedAt: null })
    expect(r).toMatchObject({ eligible: false, alreadyErased: false })
    if (!r.eligible) expect(r.reason).toMatch(/fusionnée/)
  })
})

describe("buildErasurePlan (#516): what is removed and what is kept", () => {
  it("keeps every registration, every status, scrubbed and re-tokened", () => {
    const plan = buildErasurePlan(input())
    expect(plan.registrationIdsToScrub).toEqual(["reg-past", "reg-future", "reg-wait", "reg-cancelled"])
    expect(plan.registrationIdsToRetoken).toEqual(plan.registrationIdsToScrub)
  })

  it("deletes invitations (with the « not available » state), answers, devices, leader entries, dismissals and tombstones", () => {
    const plan = buildErasurePlan(input())
    expect(plan.delete).toEqual({
      inviteIds: ["inv-1", "inv-declined"],
      answerIds: ["ans-1"],
      pushSubscriptionIds: ["push-1"],
      sectorLeaderIds: ["lead-1"],
      duplicateDismissalIds: ["dis-1"],
      tombstoneIds: ["tomb-1"],
    })
  })

  it("counts upcoming live registrations only (not past, not cancelled) for the recap warning", () => {
    const plan = buildErasurePlan(input())
    expect(plan.counts).toEqual({ registrations: 4, upcomingLive: 2, invites: 2, answers: 1, pushSubscriptions: 1, sectorLeaders: 1, tombstones: 1 })
  })

  it("never lists the member itself as one of its tombstones", () => {
    const plan = buildErasurePlan(input({ tombstoneIds: ["vol-1", "tomb-1"] }))
    expect(plan.delete.tombstoneIds).toEqual(["tomb-1"])
  })

  it("refuses an already erased record or a tombstone without planning anything", () => {
    expect(() => buildErasurePlan(input({ member: { ...member, erasedAt: new Date() } }))).toThrow(MemberErasureRefusedError)
    expect(() => buildErasurePlan(input({ member: { ...member, mergedIntoId: "x" } }))).toThrow(MemberErasureRefusedError)
  })

  it("an empty record still gets a plan: nothing to delete, the record itself is still emptied", () => {
    const plan = buildErasurePlan(input({ registrations: [], inviteIds: [], answerIds: [], pushSubscriptionIds: [], sectorLeaderIds: [], duplicateDismissalIds: [], tombstoneIds: [] }))
    expect(plan.counts.registrations).toBe(0)
    expect(Object.values(plan.delete).every((ids) => ids.length === 0)).toBe(true)
  })
})

describe("erasedVolunteerData / ERASED_REGISTRATION_DATA (#516)", () => {
  it("names the record « Bénévole effacé » and clears every personal field, email to null (no uniqueness collision)", () => {
    const now = new Date("2026-10-05T10:00:00Z")
    const data = erasedVolunteerData(now)
    expect(`${data.firstName} ${data.lastName}`).toBe(ERASED_DISPLAY_NAME)
    expect(data).toMatchObject({ email: null, phone: null, notes: null, birthDate: null, availabilityNote: null, tags: [], availabilityPeriods: [], active: false, erasedAt: now })
  })

  it("clears the comment and the phone of each kept registration", () => {
    expect(ERASED_REGISTRATION_DATA).toEqual({ comment: null, phone: null })
  })
})

describe("tombstoneChain (#516, #600)", () => {
  it("follows chains of merges into the record, and nothing else", () => {
    const rows = [
      { id: "a", mergedIntoId: "b" },
      { id: "b", mergedIntoId: "root" },
      { id: "c", mergedIntoId: "root" },
      { id: "other", mergedIntoId: "someone-else" },
    ]
    expect(tombstoneChain("root", rows).sort()).toEqual(["a", "b", "c"])
  })

  it("is cycle-safe", () => {
    expect(tombstoneChain("root", [{ id: "x", mergedIntoId: "root" }, { id: "root", mergedIntoId: "x" }])).toEqual(["x"])
  })
})

describe("outboxPayloadConcernsMember (#516)", () => {
  const who = { volunteerId: "vol-1", email: "Julie.Martin@example.com", firstName: "Julie", lastName: "Martin" }

  it("matches a row tied to the member (#598 volunteerId)", () => {
    expect(outboxPayloadConcernsMember({ volunteerId: "vol-1", recipient: { email: "other@x.ch" }, data: {} }, who)).toBe(true)
  })

  it("matches a row addressed to their address, case and spaces aside", () => {
    expect(outboxPayloadConcernsMember({ recipient: { email: " julie.martin@EXAMPLE.com " }, data: {} }, who)).toBe(true)
  })

  it("matches a row to someone else that names them (organizer notice, daily summary)", () => {
    expect(outboxPayloadConcernsMember({ recipient: { email: "admin@x.ch" }, data: { members: [{ name: "julie martin" }] } }, who)).toBe(true)
    expect(outboxPayloadConcernsMember({ recipient: { email: "admin@x.ch" }, data: { note: "écrire à julie.martin@example.com" } }, who)).toBe(true)
  })

  it("leaves unrelated rows alone, another member's row included", () => {
    expect(outboxPayloadConcernsMember({ volunteerId: "vol-2", recipient: { email: "paul@x.ch" }, data: { name: "Paul Durand" } }, who)).toBe(false)
  })

  it("doesn't match on a name too short to be meaningful", () => {
    const short = { volunteerId: "vol-9", email: null, firstName: "Al", lastName: "B" }
    expect(outboxPayloadConcernsMember({ recipient: { email: "admin@x.ch" }, data: { text: "al b est inscrit" } }, short)).toBe(false)
  })
})

const recapText = (r: ReturnType<typeof eraseMemberRecap>) =>
  [r.title, r.lead, r.warning, ...(r.groups ?? []).flatMap((g) => [g.heading, ...g.items]), ...r.lines].filter(Boolean).join("\n")

describe("eraseMemberRecap (#516)", () => {
  const counts = { registrations: 4, upcomingLive: 2, invites: 2, answers: 1, pushSubscriptions: 1, sectorLeaders: 1, tombstones: 0 }

  it("leads with irreversible, then the warning, then « Effacé : » and « Conservé : » groups, one item each", () => {
    const r = eraseMemberRecap("Julie Martin", counts)
    expect(r.title).toBe("Effacer les données personnelles de Julie Martin ?")
    expect(r.danger).toBe(true)
    expect(r.confirmLabel).toBe("Effacer les données")
    expect(r.lead).toMatch(/irréversible/)
    expect(r.warning).toBe("2 inscriptions à venir restent comptées dans les effectifs. Retirez-les d'abord si la personne ne viendra pas.")
    expect(r.groups?.map((g) => g.heading)).toEqual(["Effacé :", "Conservé :"])
    const [erased, kept] = r.groups!
    expect(erased.items).toContain("email et téléphone")
    expect(erased.items.some((i) => i.includes("Bénévole effacé"))).toBe(true)
    expect(erased.items).toContain("2 invitations (et leurs réponses « pas disponible » éventuelles)")
    expect(erased.items.some((i) => i.startsWith("1 désignation"))).toBe(true)
    expect(kept.items[0]).toMatch(/^4 inscriptions \(créneau, statut, présence\), sans identité/)
    const text = recapText(r)
    expect(text).toMatch(/attestations de bénévolat et les exports d'heures ne la nommeront plus/)
    expect(text).toMatch(/sans dire qui/)
  })

  it("singular forms, no warning when nothing is upcoming, no empty item", () => {
    const r = eraseMemberRecap("Julie Martin", { ...counts, registrations: 1, upcomingLive: 0, invites: 1, answers: 0, pushSubscriptions: 0, sectorLeaders: 0 })
    expect(r.warning).toBeUndefined()
    expect(r.groups![0].items).toContain("1 invitation (et sa réponse « pas disponible » éventuelle)")
    expect(r.groups![0].items.some((i) => i.includes("abonnement"))).toBe(false)
    expect(r.groups![1].items[0]).toMatch(/^1 inscription \(/)
    const single = eraseMemberRecap("J M", { ...counts, upcomingLive: 1 })
    expect(single.warning).toMatch(/^1 inscription à venir reste comptée .* Retirez-la/)
  })

  it("new copy uses no middle dot and no em dash", () => {
    const text = [eraseMemberRecap("Julie Martin", counts), eraseMemberRecap("J M", { ...counts, registrations: 0, invites: 0, answers: 0, pushSubscriptions: 0, sectorLeaders: 0, upcomingLive: 0 })]
      .map(recapText)
      .join("\n")
    expect(text).not.toMatch(/[·—]/)
  })
})
