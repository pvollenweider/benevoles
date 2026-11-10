// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  bulkDeactivationResultText,
  partitionMembersForBulkDeactivation,
  type BulkDeactivationMember,
  type BulkDeactivationResult,
} from "../member-bulk-deactivation"

const member = (id: string, over: Partial<BulkDeactivationMember> = {}): BulkDeactivationMember => ({
  id,
  firstName: "Alice",
  lastName: "Martin",
  active: true,
  mergedIntoId: null,
  ...over,
})

describe("partitionMembersForBulkDeactivation (#1307)", () => {
  it("deactivates active records, leaves already inactive ones, ignores merged tombstones and unknown ids", () => {
    const members = [
      member("active", { firstName: "Anne", lastName: "Favre" }),
      member("inactive", { firstName: "Marc", lastName: "Rochat", active: false }),
      member("merged", { firstName: "", lastName: "", active: false, mergedIntoId: "active" }),
    ]

    const partition = partitionMembersForBulkDeactivation(
      ["active", "inactive", "merged", "missing"],
      members,
    )

    expect(partition.deactivatable.map((m) => m.id)).toEqual(["active"])
    expect(partition.skipped).toEqual([
      { id: "inactive", reason: "inactive", name: "Marc Rochat" },
      { id: "merged", reason: "merged", name: null },
      { id: "missing", reason: "notFound", name: null },
    ])
  })

  it("counts a duplicated id once and keeps the requested order", () => {
    const partition = partitionMembersForBulkDeactivation(
      ["b", "a", "b"],
      [member("a"), member("b")],
    )
    expect(partition.deactivatable.map((m) => m.id)).toEqual(["b", "a"])
    expect(partition.skipped).toEqual([])
  })
})

describe("bulkDeactivationResultText (#1307)", () => {
  const result = (deactivated: string[], skipped: BulkDeactivationResult["skipped"] = []): BulkDeactivationResult => ({ deactivated, skipped })

  it("reads the issue's example: deactivated plus already inactive", () => {
    const deactivated = Array.from({ length: 12 }, (_, i) => `id-${i}`)
    const skipped = [
      { id: "i1", reason: "inactive" as const, name: "Anne Favre" },
      { id: "i2", reason: "inactive" as const, name: "Marc Rochat" },
    ]
    expect(bulkDeactivationResultText(result(deactivated, skipped))).toBe("12 membres désactivés. 2 déjà inactifs.")
  })

  it("uses the singular, and says none when nothing was deactivated", () => {
    expect(bulkDeactivationResultText(result(["a"]))).toBe("1 membre désactivé.")
    expect(bulkDeactivationResultText(result([], [{ id: "a", reason: "inactive", name: "Anne Favre" }]))).toBe(
      "Aucun membre désactivé. 1 déjà inactif.",
    )
  })

  it("says merged tombstones and unknown ids apart, singular and plural", () => {
    expect(bulkDeactivationResultText(result([], [
      { id: "a", reason: "merged", name: "Ancienne fiche" },
      { id: "b", reason: "notFound", name: null },
    ]))).toBe(
      "Aucun membre désactivé. 1 fiche fusionnée ignorée. 1 identifiant introuvable dans votre organisation.",
    )
    expect(bulkDeactivationResultText(result([], [
      { id: "a", reason: "merged", name: "A" },
      { id: "b", reason: "merged", name: "B" },
      { id: "c", reason: "notFound", name: null },
      { id: "d", reason: "notFound", name: null },
    ]))).toBe(
      "Aucun membre désactivé. 2 fiches fusionnées ignorées. 2 identifiants introuvables dans votre organisation.",
    )
  })

  it("only says what happened when everything went through", () => {
    expect(bulkDeactivationResultText(result(["a", "b"]))).not.toMatch(/inactif|introuvable|fusionnée/)
  })
})
