// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  bulkDeletionEligibility,
  bulkDeletionResultText,
  partitionMembersForBulkDeletion,
  type BulkDeletionMember,
  type BulkDeletionResult,
} from "../member-bulk-deletion"
import { memberDeletionEligibility } from "../member-deletion"

const member = (id: string, over: Partial<BulkDeletionMember> = {}): BulkDeletionMember => ({
  id,
  firstName: "Alice",
  lastName: "Martin",
  active: true,
  mergedIntoId: null,
  ...over,
})

describe("bulkDeletionEligibility (#1305)", () => {
  it("deletes an active record without any registration (the owner-decided difference)", () => {
    expect(bulkDeletionEligibility(member("a"), 0)).toEqual({ eligible: true })
  })

  it("deletes an inactive record without any registration, like the single action", () => {
    expect(bulkDeletionEligibility(member("a", { active: false }), 0)).toEqual({ eligible: true })
  })

  it("keeps a record with any registration, whatever its status", () => {
    expect(bulkDeletionEligibility(member("a"), 1)).toEqual({ eligible: false, reason: "registrations" })
    expect(bulkDeletionEligibility(member("a", { active: false }), 4)).toEqual({ eligible: false, reason: "registrations" })
  })

  it("keeps a merged tombstone even without registration", () => {
    expect(bulkDeletionEligibility(member("a", { active: false, mergedIntoId: "keep" }), 0)).toEqual({ eligible: false, reason: "merged" })
  })

  it("leaves the single-member rule unchanged: an active record without registration is still refused", () => {
    expect(memberDeletionEligibility(member("a"), 0)).toMatchObject({ eligible: false })
  })
})

describe("partitionMembersForBulkDeletion (#1305)", () => {
  const registrationCounts = new Map([
    ["with-registration", 2],
    ["inactive-with-registration", 1],
  ])

  it("splits active/inactive without registration from records with registrations, merged tombstones and unknown ids", () => {
    const members = [
      member("active", { firstName: "Anne", lastName: "Favre" }),
      member("inactive", { firstName: "Marc", lastName: "Rochat", active: false }),
      member("with-registration", { firstName: "Léa", lastName: "Dubois" }),
      member("inactive-with-registration", { firstName: "Jean", lastName: "Dupont", active: false }),
      member("merged", { firstName: "", lastName: "", active: false, mergedIntoId: "active" }),
    ]

    const partition = partitionMembersForBulkDeletion(
      ["active", "inactive", "with-registration", "inactive-with-registration", "merged", "missing"],
      members,
      registrationCounts,
    )

    expect(partition.deletable.map((m) => m.id)).toEqual(["active", "inactive"])
    expect(partition.skipped).toEqual([
      { id: "with-registration", reason: "registrations", name: "Léa Dubois" },
      { id: "inactive-with-registration", reason: "registrations", name: "Jean Dupont" },
      { id: "merged", reason: "merged", name: null },
      { id: "missing", reason: "notFound", name: null },
    ])
  })

  it("counts a duplicated id once and keeps the requested order", () => {
    const partition = partitionMembersForBulkDeletion(
      ["b", "a", "b"],
      [member("a"), member("b")],
      new Map(),
    )
    expect(partition.deletable.map((m) => m.id)).toEqual(["b", "a"])
    expect(partition.skipped).toEqual([])
  })
})

describe("bulkDeletionResultText (#1305)", () => {
  const result = (deleted: string[], skipped: BulkDeletionResult["skipped"] = []): BulkDeletionResult => ({ deleted, skipped })

  it("says all deleted, with the plural", () => {
    expect(bulkDeletionResultText(result(["1", "2", "3"]))).toBe("3 membres supprimés.")
  })

  it("says all deleted, with the singular", () => {
    expect(bulkDeletionResultText(result(["1"]))).toBe("1 membre supprimé.")
  })

  it("says none deleted when every record was kept", () => {
    expect(bulkDeletionResultText(result([], [{ id: "a", reason: "registrations", name: "Anne Favre" }]))).toBe(
      "Aucun membre supprimé. 1 laissé car il a des inscriptions : Anne Favre. Vous pouvez l'effacer depuis sa fiche.",
    )
  })

  it("names every member kept for their registrations, as the issue's example", () => {
    expect(bulkDeletionResultText(result(
      Array.from({ length: 198 }, (_, i) => `id-${i}`),
      [
        { id: "a", reason: "registrations", name: "Anne Favre" },
        { id: "b", reason: "registrations", name: "Marc Rochat" },
        { id: "c", reason: "registrations", name: "Léa Dubois" },
      ],
    ))).toBe(
      "198 membres supprimés. 3 laissés car ils ont des inscriptions : Anne Favre, Marc Rochat, Léa Dubois. Vous pouvez les effacer depuis leur fiche.",
    )
  })

  it("says merged tombstones and unknown ids separately, in the singular too", () => {
    expect(bulkDeletionResultText(result([], [
      { id: "a", reason: "merged", name: "Ancienne fiche" },
      { id: "b", reason: "notFound", name: null },
    ]))).toBe(
      "Aucun membre supprimé. 1 laissé car la fiche est fusionnée : Ancienne fiche. 1 identifiant introuvable dans votre organisation.",
    )
    expect(bulkDeletionResultText(result([], [
      { id: "a", reason: "merged", name: "A" },
      { id: "b", reason: "merged", name: "B" },
      { id: "c", reason: "notFound", name: null },
      { id: "d", reason: "notFound", name: null },
    ]))).toBe(
      "Aucun membre supprimé. 2 laissés car les fiches sont fusionnées : A, B. 2 identifiants introuvables dans votre organisation.",
    )
  })

  it("only says what happened when nothing was skipped", () => {
    expect(bulkDeletionResultText(result(["a"]))).not.toMatch(/laissé|introuvable/)
  })
})
