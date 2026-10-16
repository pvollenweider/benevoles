import { describe, expect, it } from "vitest"
import {
  activityTitle,
  formatRecordDay,
  memberRecordState,
  mergedPageSentence,
  mergedRecordDeletionDay,
  mergedRowSentence,
  recordDisplayName,
  recordRowText,
  recordSubject,
  resolveMergeTarget,
  sentenceText,
  type RecordStateSource,
} from "../member-record-state"
import { RETENTION_DAYS } from "../retention"

// #1014: absorbed (merged) and erased member records, explained in the members list.

const rec = (over: Partial<RecordStateSource> & { id: string }): RecordStateSource => ({
  firstName: "", lastName: "", mergedIntoId: null, mergedAt: null, erasedAt: null, ...over,
})

describe("mergedRecordDeletionDay", () => {
  it("is the merge day plus the retention delay, as a calendar day in the organisation's zone", () => {
    expect(RETENTION_DAYS.mergedMemberTombstone).toBe(30)
    expect(mergedRecordDeletionDay(new Date("2026-10-15T10:00:00Z"), "Europe/Zurich")).toBe("2026-11-14")
  })

  it("uses the organisation's zone, not UTC, near midnight", () => {
    // 23:30 UTC on Oct 15 is already Oct 16 in Zurich, still Oct 15 in New York.
    const at = new Date("2026-10-15T23:30:00Z")
    expect(mergedRecordDeletionDay(at, "Europe/Zurich")).toBe("2026-11-15")
    expect(mergedRecordDeletionDay(at, "America/New_York")).toBe("2026-11-14")
  })
})

describe("resolveMergeTarget", () => {
  it("follows a chain of merges to the record that holds the person now", () => {
    const byId = new Map([
      ["a", rec({ id: "a", mergedIntoId: "b" })],
      ["b", rec({ id: "b", mergedIntoId: "c" })],
      ["c", rec({ id: "c", firstName: "Marie", lastName: "Dupont" })],
    ])
    expect(resolveMergeTarget("a", byId)).toEqual({ id: "c", name: "Marie Dupont" })
  })

  it("returns null for a missing target or a cycle, never a wrong record", () => {
    expect(resolveMergeTarget("a", new Map([["a", rec({ id: "a", mergedIntoId: "gone" })]]))).toBeNull()
    const cycle = new Map([
      ["a", rec({ id: "a", mergedIntoId: "b" })],
      ["b", rec({ id: "b", mergedIntoId: "a" })],
    ])
    expect(resolveMergeTarget("a", cycle)).toBeNull()
  })
})

describe("memberRecordState", () => {
  const keep = rec({ id: "keep", firstName: "Marie", lastName: "Dupont" })
  const tomb = rec({ id: "tomb", mergedIntoId: "keep", mergedAt: new Date("2026-10-15T10:00:00Z") })
  const byId = new Map([[keep.id, keep], [tomb.id, tomb]])

  it("an ordinary record", () => {
    expect(memberRecordState(keep, byId, "Europe/Zurich")).toEqual({ kind: "ordinary" })
  })

  it("an absorbed record names the kept one and its deletion day", () => {
    expect(memberRecordState(tomb, byId, "Europe/Zurich")).toEqual({ kind: "merged", keptId: "keep", keptName: "Marie Dupont", deletionDay: "2026-11-14" })
  })

  it("an erased record, with its erasure day", () => {
    const erased = rec({ id: "e", firstName: "Bénévole", lastName: "effacé", erasedAt: new Date("2026-03-03T09:00:00Z") })
    expect(memberRecordState(erased, byId, "Europe/Zurich")).toEqual({ kind: "erased", erasedDay: "2026-03-03" })
  })

  it("an absorbed record whose kept record is unknown has no name, no link", () => {
    const orphan = rec({ id: "o", mergedIntoId: "gone", mergedAt: new Date("2026-10-15T10:00:00Z") })
    expect(memberRecordState(orphan, byId, "Europe/Zurich")).toMatchObject({ kind: "merged", keptId: null, keptName: null })
  })
})

describe("row and page copy", () => {
  const merged = { kind: "merged" as const, keptId: "keep", keptName: "Marie Dupont", deletionDay: "2026-11-14" }
  const erased = { kind: "erased" as const, erasedDay: "2026-03-03" }

  it("formats a calendar day in French without shifting it", () => {
    expect(formatRecordDay("2026-11-14")).toBe("14 novembre 2026")
  })

  it("the absorbed row: kept name and deletion day", () => {
    expect(recordRowText(merged, formatRecordDay)).toBe("Fusionnée dans Marie Dupont · supprimée automatiquement à partir du 14 novembre 2026")
    expect(sentenceText(mergedRowSentence({ ...merged, keptId: null, keptName: null }, formatRecordDay)))
      .toBe("Fusionnée dans une autre fiche · supprimée automatiquement à partir du 14 novembre 2026")
  })

  it("the erased row: why it stays", () => {
    expect(recordRowText(erased, formatRecordDay)).toBe("Données effacées · gardée pour l'historique (effectifs et heures)")
  })

  it("an ordinary row has no explanation", () => {
    expect(recordRowText({ kind: "ordinary" }, formatRecordDay)).toBeNull()
  })

  it("the absorbed record's page sentence states the delay and the day", () => {
    expect(sentenceText(mergedPageSentence(merged, formatRecordDay)))
      .toBe("Cette fiche a été fusionnée dans Marie Dupont. Elle est gardée 30 jours après la fusion, puis supprimée automatiquement à partir du 14 novembre 2026.")
  })

  it("names: an absorbed record has none left, an erased one is « Bénévole effacé »", () => {
    expect(recordDisplayName(merged, "", "")).toBe("Fiche fusionnée")
    expect(recordDisplayName(erased, "Bénévole", "effacé")).toBe("Bénévole effacé")
    expect(recordDisplayName({ kind: "ordinary" }, "Alice", "Martin")).toBe("Alice Martin")
  })

  it("subjects stay unique per row and readable in a title", () => {
    expect(activityTitle(recordSubject(merged, "", "", formatRecordDay))).toBe("Activité de la fiche fusionnée dans Marie Dupont")
    expect(recordSubject({ ...merged, keptName: null, keptId: null }, "", "", formatRecordDay)).toBe("la fiche fusionnée")
    expect(recordSubject(erased, "Bénévole", "effacé", formatRecordDay)).toBe("la fiche effacée le 3 mars 2026")
    expect(recordSubject({ kind: "ordinary" }, "Alice", "Martin", formatRecordDay)).toBe("Alice Martin")
  })
})
